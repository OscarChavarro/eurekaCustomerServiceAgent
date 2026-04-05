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
}
