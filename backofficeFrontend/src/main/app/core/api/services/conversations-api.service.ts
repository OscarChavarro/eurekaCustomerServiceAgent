import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendConversationRawMessage = {
  externalId: string;
  direction: string;
  text: string;
  sentAt: string | null;
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
  date: string | null;
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
}
