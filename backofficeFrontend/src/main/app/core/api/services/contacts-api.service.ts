import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendContact = {
  names: string[];
  phoneNumbers: string[];
};

export type BackendContactsResponse = {
  contacts: BackendContact[];
};

@Injectable({ providedIn: 'root' })
export class ContactsApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly frontendSecretsService = inject(FrontendSecretsService);

  public getContacts(pageSize = 1000): Observable<BackendContactsResponse> {
    const normalizedPageSize = this.normalizePageSize(pageSize);
    const params = new HttpParams().set('pageSize', String(normalizedPageSize));

    return this.httpClient.get<BackendContactsResponse>(
      `${this.frontendSecretsService.contactsBackendBaseUrl}/contacts`,
      { params }
    );
  }

  private normalizePageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize)) {
      return 1000;
    }

    const normalized = Math.trunc(pageSize);
    if (normalized < 1) {
      return 1;
    }

    if (normalized > 1000) {
      return 1000;
    }

    return normalized;
  }
}
