import { ContactEntry, ContactsBackendPort } from '../../application/ports';

type ContactsBackendHttpAdapterOptions = {
  baseUrl: string;
  pageSize: number;
  requestTimeoutMs: number;
};

type ContactsListResponse = {
  contacts?: {
    names?: unknown;
    phoneNumbers?: unknown;
  }[];
};

export class ContactsBackendHttpAdapter implements ContactsBackendPort {
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly requestTimeoutMs: number;
  private contactsPromise: Promise<ContactEntry[]> | null = null;

  constructor(options: ContactsBackendHttpAdapterOptions) {
    this.baseUrl = options.baseUrl;
    this.pageSize = options.pageSize;
    this.requestTimeoutMs = options.requestTimeoutMs;
  }

  async assertHealth(): Promise<void> {
    const response = await this.requestJson(`${this.baseUrl}/health`);
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

  private async fetchContacts(): Promise<ContactEntry[]> {
    const payload = await this.requestJson(`${this.baseUrl}/contacts?pageSize=${this.pageSize}`);
    const parsed = payload as ContactsListResponse;
    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];

    return contacts.map((item) => ({
      names: this.toStringArray(item.names),
      phoneNumbers: this.toStringArray(item.phoneNumbers)
    }));
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim());
  }

  private async requestJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

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
