import { Injectable } from '@nestjs/common';
import type {
  ContactDirectoryContact,
  ContactsDirectoryPort
} from '../../../application/ports/outbound/contacts-directory.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

type ContactsBackendListResponse = {
  contacts?: unknown;
};

@Injectable()
export class HttpContactsDirectoryAdapter implements ContactsDirectoryPort {
  private static readonly GOOGLE_PEOPLE_MAX_PAGE_SIZE = 1000;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async checkHealth(): Promise<void> {
    const response = await this.fetchWithTimeout(this.buildUrl('/health'));

    if (!response.ok) {
      throw new Error(
        `contactsBackend health check failed with status ${response.status} ${response.statusText}.`
      );
    }
  }

  public async listContacts(): Promise<ContactDirectoryContact[]> {
    const response = await this.fetchWithTimeout(
      this.buildUrl(
        `/contacts?pageSize=${HttpContactsDirectoryAdapter.GOOGLE_PEOPLE_MAX_PAGE_SIZE}`
      )
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `contactsBackend /contacts call failed with status ${response.status} ${response.statusText}. ${body}`
      );
    }

    const payload = (await response.json()) as ContactsBackendListResponse;
    const rawContacts = Array.isArray(payload.contacts) ? payload.contacts : [];

    return rawContacts
      .map((rawContact) => this.toContactDirectoryContact(rawContact))
      .filter((contact): contact is ContactDirectoryContact => contact !== null);
  }

  private toContactDirectoryContact(rawContact: unknown): ContactDirectoryContact | null {
    if (!rawContact || typeof rawContact !== 'object') {
      return null;
    }

    const contactCandidate = rawContact as { names?: unknown; phoneNumbers?: unknown };
    const names = this.toStringArray(contactCandidate.names);
    const phoneNumbers = this.toStringArray(contactCandidate.phoneNumbers);

    if (names.length === 0 || phoneNumbers.length === 0) {
      return null;
    }

    return {
      names,
      phoneNumbers
    };
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private buildUrl(pathnameWithQuery: string): string {
    const baseUrl = this.serviceConfig.contactsBackendConfig.url.replace(/\/$/, '');
    return `${baseUrl}${pathnameWithQuery.startsWith('/') ? pathnameWithQuery : `/${pathnameWithQuery}`}`;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error(`Cannot connect to contactsBackend at ${url}. ${String(error)}`);
    }
  }
}
