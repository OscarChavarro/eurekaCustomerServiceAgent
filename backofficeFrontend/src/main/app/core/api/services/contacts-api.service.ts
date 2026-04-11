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

export type UpsertContactRequest = {
  currentName?: string;
  currentPhoneNumber?: string;
  newName: string;
  newPhoneNumber: string;
};

export type UpsertContactResponse = {
  action: 'created' | 'updated';
  contact: {
    name: string;
    phoneNumbers: string[];
  };
};

export type DeleteContactRequestItem = {
  nameToDelete?: string;
  phoneToDelete?: string;
};

export type DeleteContactsResponse = {
  action: 'deleted';
  mode: 'simulated';
  requestedCount: number;
  contacts: Array<{
    nameToDelete: string;
    phoneToDelete: string;
  }>;
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

  public upsertContact(request: UpsertContactRequest): Observable<UpsertContactResponse> {
    return this.httpClient.put<UpsertContactResponse>(
      `${this.frontendSecretsService.contactsBackendBaseUrl}/contacts/upsert`,
      request
    );
  }

  public deleteContacts(request: DeleteContactRequestItem[]): Observable<DeleteContactsResponse> {
    return this.httpClient.delete<DeleteContactsResponse>(
      `${this.frontendSecretsService.contactsBackendBaseUrl}/contacts`,
      {
        body: request
      }
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
