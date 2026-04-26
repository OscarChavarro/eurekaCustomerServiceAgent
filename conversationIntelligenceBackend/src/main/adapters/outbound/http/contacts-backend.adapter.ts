import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import type { ContactRecord, ContactsPort } from '../../../ports/outbound/contacts.port';

type ContactsResponse = {
  contacts?: Array<{
    resourceName?: string;
    names?: string[];
    phoneNumbers?: string[];
  }>;
};

@Injectable()
export class ContactsBackendAdapter implements ContactsPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async listContacts(pageSize: number): Promise<ContactRecord[]> {
    const url = `${this.serviceConfig.contactsBackendConfig.baseUrl}/contacts?pageSize=${pageSize}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw new Error(
        `contactsBackend /contacts failed at ${url}: returned ${response.status} ${response.statusText}.`
      );
    }

    const payload = (await response.json()) as ContactsResponse;
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];

    return contacts
      .map((item) => ({
        resourceName: item.resourceName?.trim() ?? '',
        names: Array.isArray(item.names) ? item.names.filter((name) => name.trim().length > 0) : [],
        phoneNumbers: Array.isArray(item.phoneNumbers)
          ? item.phoneNumbers.filter((phone) => phone.trim().length > 0)
          : []
      }))
      .filter((item) => item.resourceName.length > 0);
  }
}
