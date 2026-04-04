import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendConversationRawMessage = {
  externalId: string;
  direction: string;
  text: string;
  sentAt: string;
};

export type BackendConversationDocument = {
  _id: string;
  rawMessages?: BackendConversationRawMessage[];
  [key: string]: unknown;
};

@Injectable({ providedIn: 'root' })
export class ConversationsApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly frontendSecretsService = inject(FrontendSecretsService);

  public getConversationIds(): Observable<string[]> {
    return this.httpClient.get<string[]>(
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
}
