import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendConversationRawMessage = {
  externalId: string;
  direction: string;
  text: string;
  sentAt: string | null;
  normalizedFields?: {
    attachment?: string | null;
    messageDate?: string | null;
    [key: string]: unknown;
  };
};

export type BackendConversationCleanMessage = {
  externalId: string;
  direction: string;
  text: string;
};

export type BackendConversationStructuredMessage = {
  turnId: string;
  question: string;
  answer: string;
  messageIds: string[];
};

export type BackendConversationChunkMessage = {
  chunkId: string;
  chunkMessage: string;
  messageIds: string[];
};

export type BackendConversationSummary = {
  id: string;
  msg: string | null;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
};

export type BackendConversationDocument = {
  _id: string;
  rawMessages?: BackendConversationRawMessage[];
  cleanedMessages?: BackendConversationCleanMessage[];
  structuredMessages?: BackendConversationStructuredMessage[];
  chunkedMessages?: BackendConversationChunkMessage[];
  [key: string]: unknown;
};

export type PhonePrefixLookupResponse = {
  input: string;
  normalizedDigits: string;
  countryCode: string | null;
  countryName: string | null;
  dialCode: string | null;
  subzone: string | null;
  subzoneName: string | null;
};

export type RevisionStage = 'raw' | 'clean' | 'structure' | 'chunk';
export type MessageRatingValue = 'warning' | 'good' | 'bad' | 'cleared';

export type RateMessageRatingRequest = {
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: MessageRatingValue;
};

export type RateMessageRatingResponse = {
  ok: true;
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: MessageRatingValue;
  ratedAt: string;
};

export type MessageRatingsResponse = {
  conversationId: string;
  ratings: {
    raw: Record<string, 'warning'>;
    clean: Record<string, 'good' | 'bad'>;
    structure: Record<string, 'good' | 'bad'>;
    chunk: Record<string, 'good' | 'bad'>;
  };
};

export type ChatCompletionRequestMessage = {
  role: 'user';
  content: string;
};

export type ChatCompletionsRequest = {
  messages: ChatCompletionRequestMessage[];
  maxTokens: number;
};

export type ChatCompletionsStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type DeleteConversationRequest = {
  conversationId: string;
};

export type DeleteConversationResponse = {
  ok: true;
  conversationId: string;
  csvMoved: boolean;
  csvFromPath: string | null;
  csvToPath: string | null;
  embeddingsDeleted: number;
  conversationDeleted: boolean;
};

type StreamCallbacks = {
  onChunk: (chunk: ChatCompletionsStreamChunk) => void;
  onDone: () => void;
};

@Injectable({ providedIn: 'root' })
export class ConversationsApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly frontendSecretsService = inject(FrontendSecretsService);

  public getConversationIds(): Observable<BackendConversationSummary[]> {
    return this.httpClient.get<BackendConversationSummary[]>(
      `${this.frontendSecretsService.backendBaseUrl}/conversations`
    );
  }

  public getConversationById(conversationId: string): Observable<BackendConversationDocument> {
    const params = new HttpParams().set('id', conversationId);

    return this.httpClient.get<BackendConversationDocument>(
      `${this.frontendSecretsService.backendBaseUrl}/messages`,
      { params }
    );
  }

  public getPhonePrefix(phone: string): Observable<PhonePrefixLookupResponse> {
    const params = new HttpParams().set('phone', phone);

    return this.httpClient.get<PhonePrefixLookupResponse>(
      `${this.frontendSecretsService.backendBaseUrl}/phone-prefix`,
      { params }
    );
  }

  public rateMessage(
    request: RateMessageRatingRequest
  ): Observable<RateMessageRatingResponse> {
    return this.httpClient.post<RateMessageRatingResponse>(
      `${this.frontendSecretsService.backendBaseUrl}/message-rating`,
      request
    );
  }

  public getMessageRatings(conversationId: string): Observable<MessageRatingsResponse> {
    const params = new HttpParams().set('conversationId', conversationId);

    return this.httpClient.get<MessageRatingsResponse>(
      `${this.frontendSecretsService.backendBaseUrl}/message-ratings`,
      { params }
    );
  }

  public deleteConversation(
    request: DeleteConversationRequest
  ): Observable<DeleteConversationResponse> {
    return this.httpClient.delete<DeleteConversationResponse>(
      `${this.frontendSecretsService.backendBaseUrl}/conversation`,
      {
        body: request
      }
    );
  }

  public async streamChatCompletions(
    request: ChatCompletionsRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const response = await fetch(`${this.frontendSecretsService.backendBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messages: request.messages,
        max_tokens: request.maxTokens
      })
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new Error(errorBody || `Chat completion stream failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        buffer = this.processSseEvents(buffer, callbacks);
      }

      if (done) {
        buffer += decoder.decode();
        this.processSseEvents(buffer, callbacks);
        break;
      }
    }
  }

  private processSseEvents(buffer: string, callbacks: StreamCallbacks): string {
    const eventSeparator = '\n\n';
    let workingBuffer = buffer;

    while (true) {
      const separatorIndex = workingBuffer.indexOf(eventSeparator);

      if (separatorIndex < 0) {
        return workingBuffer;
      }

      const rawEvent = workingBuffer.slice(0, separatorIndex);
      this.handleSseEvent(rawEvent, callbacks);
      workingBuffer = workingBuffer.slice(separatorIndex + eventSeparator.length);
    }
  }

  private handleSseEvent(rawEvent: string, callbacks: StreamCallbacks): void {
    const payload = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');

    if (!payload) {
      return;
    }

    if (payload === '[DONE]') {
      callbacks.onDone();
      return;
    }

    try {
      const parsedChunk = JSON.parse(payload) as ChatCompletionsStreamChunk;
      callbacks.onChunk(parsedChunk);
    } catch {
      // Ignore malformed or partial non-JSON events.
    }
  }
}
