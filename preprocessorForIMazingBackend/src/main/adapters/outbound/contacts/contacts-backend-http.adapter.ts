import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ContactEntry, ContactsBackendPort } from '../../../application/ports';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

type ContactsListResponse = {
  contacts?: {
    names?: unknown;
    phoneNumbers?: unknown;
  }[];
};

@Injectable()
export class ContactsBackendHttpAdapter implements ContactsBackendPort {
  private contactsPromise: Promise<ContactEntry[]> | null = null;
  private contactsHashPromise: Promise<string> | null = null;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  async assertHealth(): Promise<void> {
    const response = await this.requestJson(`${this.serviceConfig.contactsBackendBaseUrl}/health`);
    if (response === null || typeof response !== 'object') {
      throw new Error('contactsBackend /health returned an invalid payload.');
    }

    const status = (response as { status?: unknown }).status;
    if (status !== 'ok') {
      throw new Error('contactsBackend /health is not reporting status "ok".');
    }
  }

  async listContacts(): Promise<ContactEntry[]> {
    if (this.contactsPromise === null) {
      this.contactsPromise = this.fetchContacts();
    }

    return this.contactsPromise;
  }

  async getContactsHash(): Promise<string> {
    if (this.contactsHashPromise === null) {
      this.contactsHashPromise = this.createContactsHash();
    }

    return this.contactsHashPromise;
  }

  private async fetchContacts(): Promise<ContactEntry[]> {
    const payload = await this.requestJson(
      `${this.serviceConfig.contactsBackendBaseUrl}/contacts?pageSize=${this.serviceConfig.contactsBackendPageSize}`
    );
    const parsed = payload as ContactsListResponse;
    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

    return contacts.map((item) => ({
      names: this.toStringArray(item.names),
      phoneNumbers: this.toStringArray(item.phoneNumbers)
    }));
  }

  private async createContactsHash(): Promise<string> {
    const contacts = await this.listContacts();
    const normalizedContacts = contacts
      .map((contact) => ({
        names: [...contact.names].sort((left, right) => left.localeCompare(right)),
        phoneNumbers: [...contact.phoneNumbers].sort((left, right) => left.localeCompare(right))
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    return createHash('sha256').update(JSON.stringify(normalizedContacts), 'utf8').digest('hex');
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim());
  }

  private async requestJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.serviceConfig.contactsBackendRequestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${url} responded ${response.status} ${response.statusText}.`);
      }

      return response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to reach contactsBackend at ${url}. ${message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
