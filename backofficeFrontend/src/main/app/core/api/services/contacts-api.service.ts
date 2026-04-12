import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FrontendSecretsService } from './frontend-secrets.service';

export type BackendContact = {
  resourceName?: string;
  names: string[];
  phoneNumbers: string[];
};

export type BackendContactsResponse = {
  contacts: BackendContact[];
};

export type PatchContactRequest = {
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type CreateContactRequest = {
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type CreateContactResponse = {
  action: 'created';
  contact: {
    resourceName: string;
    names: string[];
    emailAddresses: string[];
    phoneNumbers: string[];
    biographies: string[];
  };
};

export type PatchContactResponse = {
  action: 'updated';
  contact: {
    resourceName: string;
    names: string[];
    emailAddresses: string[];
    phoneNumbers: string[];
    biographies: string[];
  };
};

export type DeleteContactRequestItem = {
  nameToDelete?: string;
  phoneToDelete?: string;
};

export type DeleteContactsResponse = {
  action: 'deleted';
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

  public patchContact(
    resourceName: string,
    request: PatchContactRequest
  ): Observable<PatchContactResponse> {
    const normalizedResourceName = resourceName.trim();
    if (!normalizedResourceName) {
      throw new Error('resourceName is required to patch a Google contact.');
    }

    const encodedResourceName = encodeURIComponent(normalizedResourceName);

    return this.httpClient.patch<PatchContactResponse>(
      `${this.frontendSecretsService.contactsBackendBaseUrl}/contacts/${encodedResourceName}`,
      request
    );
  }

  public createContact(request: CreateContactRequest): Observable<CreateContactResponse> {
    return this.httpClient.post<CreateContactResponse>(
      `${this.frontendSecretsService.contactsBackendBaseUrl}/contacts`,
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
