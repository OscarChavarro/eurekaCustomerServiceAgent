import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendConversationRawMessage = {
  externalId: string;
  direction: string;
  text: string;
  sentAt: string | null;
  audioDetails?: {
    type?: 'empty' | 'voice' | 'noise' | 'music' | null;
    transcription?: string | null;
    totalTimeInSeconds?: number | null;
    language?: string | null;
    bars?: number[] | null;
  } | null;
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
  contactName: string | null;
  filePattern: string | null;
  msg: string | null;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
};

export type BackendConversationDocument = {
  _id: string;
  contactName?: string | null;
  filePattern?: string | null;
  sourceFile?: string | null;
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
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatCompletionsRequest = {
  messages: ChatCompletionRequestMessage[];
  hints?: {
    customerId: string;
  };
  maxTokens: number;
};

export type ChatCompletionResult = {
  content: string;
  usedContext: string[];
};

export type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
    [key: string]: unknown;
  }>;
  used_context_lines?: string[];
  usedContextLines?: string[];
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

export type NearestEmbeddingsRequest = {
  block: string;
  numberOfPoints: number;
};

export type NearestEmbeddingsPoint = {
  payload: Record<string, unknown>;
  vector: number[];
  score: number | null;
};

export type NearestEmbeddingsResponse = {
  points: NearestEmbeddingsPoint[];
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

  public async completeChatCompletions(request: ChatCompletionsRequest): Promise<ChatCompletionResult> {
    const response = await fetch(
      `${this.frontendSecretsService.retrievalBackendBaseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          messages: request.messages,
          hints: request.hints,
          max_tokens: request.maxTokens,
          show_used_context: true
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `Chat completion failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ChatCompletionsResponse;
    const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Chat completion response does not include assistant content.');
    }

    const rawUsedContext = payload.used_context_lines ?? payload.usedContextLines ?? [];
    const usedContext = Array.isArray(rawUsedContext)
      ? rawUsedContext.filter((line): line is string => typeof line === 'string')
      : [];

    return {
      content,
      usedContext
    };
  }

  public async nearestEmbeddings(
    request: NearestEmbeddingsRequest
  ): Promise<NearestEmbeddingsResponse> {
    const response = await fetch(
      `${this.frontendSecretsService.retrievalBackendBaseUrl}/nearestEmbeddings`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          block: request.block,
          numberOfPoints: request.numberOfPoints
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(errorBody || `Nearest embeddings failed with status ${response.status}`);
    }

    const payload = (await response.json()) as NearestEmbeddingsResponse;
    if (!Array.isArray(payload.points)) {
      return { points: [] };
    }

    return {
      points: payload.points.map((point) => ({
        payload:
          point.payload && typeof point.payload === 'object' && !Array.isArray(point.payload)
            ? point.payload
            : {},
        vector: Array.isArray(point.vector)
          ? point.vector.filter((value): value is number => typeof value === 'number')
          : [],
        score: typeof point.score === 'number' ? point.score : null
      }))
    };
  }
}
