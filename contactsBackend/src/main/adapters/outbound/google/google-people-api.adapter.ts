import { Injectable } from '@nestjs/common';
import type { GoogleAuthPort, ExchangeCodeForTokenCommand } from '../../../application/ports/outbound/google/google-auth.port';
import type {
  CreateGoogleContactCommand,
  DeleteGoogleContactCommand,
  GoogleContact,
  GooglePeoplePort,
  ListGoogleContactsResult,
  PatchGoogleContactCommand
} from '../../../application/ports/outbound/google/google-people.port';
import type { GoogleTokenSet } from '../../../application/ports/outbound/auth/google-auth-session-store.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

type GoogleTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
};

type GooglePeopleListPayload = {
  connections?: unknown;
  nextPageToken?: unknown;
};

type GooglePersonPayload = {
  resourceName?: unknown;
  etag?: unknown;
  metadata?: unknown;
  names?: unknown;
  emailAddresses?: unknown;
  phoneNumbers?: unknown;
  biographies?: unknown;
};

type GooglePersonMetadataPayload = {
  sources?: unknown;
};

type GooglePersonSourcePayload = {
  type?: unknown;
  id?: unknown;
  etag?: unknown;
};

type GoogleContactSourceForUpdate = {
  type?: string;
  id?: string;
  etag: string;
};

type GoogleContactUpdateContext = {
  contact: GoogleContact;
  etag: string;
  sources: GoogleContactSourceForUpdate[];
};

type GoogleContactPatchField = 'names' | 'emailAddresses' | 'phoneNumbers' | 'biographies';

type GooglePersonNamePayload = {
  displayName?: unknown;
  unstructuredName?: unknown;
  givenName?: unknown;
  familyName?: unknown;
};

@Injectable()
export class GooglePeopleApiAdapter implements GoogleAuthPort, GooglePeoplePort {
  private static readonly PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public buildAuthorizationUrl(state: string): string {
    const config = this.serviceConfig.googleOauthWebConfig;
    const scope = [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts'
    ].join(' ');

    const url = new URL(config.authUri);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);

    return url.toString();
  }

  public async exchangeCodeForToken(command: ExchangeCodeForTokenCommand): Promise<GoogleTokenSet> {
    const config = this.serviceConfig.googleOauthWebConfig;

    const payload = await this.requestToken(config.tokenUri, {
      code: command.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code'
    });

    return this.mapTokenPayload(payload);
  }

  public async refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
    const config = this.serviceConfig.googleOauthWebConfig;

    const payload = await this.requestToken(config.tokenUri, {
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token'
    });

    return this.mapTokenPayload(payload);
  }

  public async listContacts(accessToken: string, pageSize: number, pageToken?: string): Promise<ListGoogleContactsResult> {
    const url = new URL(`${GooglePeopleApiAdapter.PEOPLE_API_BASE}/people/me/connections`);
    url.searchParams.set('personFields', 'names,phoneNumbers');
    url.searchParams.set('pageSize', String(pageSize));

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People listContacts failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as GooglePeopleListPayload;
    const rawConnections = Array.isArray(payload.connections) ? payload.connections : [];

    return {
      contacts: rawConnections.map((item) => this.mapGooglePerson(item)).filter((item): item is GoogleContact => item !== null),
      nextPageToken: typeof payload.nextPageToken === 'string' && payload.nextPageToken.trim().length > 0
        ? payload.nextPageToken
        : undefined
    };
  }

  public async createContact(accessToken: string, command: CreateGoogleContactCommand): Promise<GoogleContact> {
    const requestBody = this.buildCreateContactRequestBody(command);

    const response = await fetch(`${GooglePeopleApiAdapter.PEOPLE_API_BASE}/people:createContact`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People createContact failed: ${response.status} ${response.statusText}. ${body}`);
    }

    return this.requireMappedPerson(await response.json());
  }

  public async patchContact(accessToken: string, command: PatchGoogleContactCommand): Promise<GoogleContact> {
    const updatePersonFields = this.extractPatchFields(command);
    if (updatePersonFields.length === 0) {
      throw new Error(
        `Google People patchContact requires at least one field to patch for "${command.resourceName}".`
      );
    }

    const updateContext = await this.getContactUpdateContext(accessToken, command.resourceName);
    const mergedNames = command.names ?? updateContext.contact.names;
    const mergedEmailAddresses = command.emailAddresses ?? updateContext.contact.emailAddresses;
    const mergedPhoneNumbers = command.phoneNumbers ?? updateContext.contact.phoneNumbers;
    const mergedBiographies = command.biographies ?? updateContext.contact.biographies;

    const requestBody: Record<string, unknown> = {
      resourceName: command.resourceName,
      etag: updateContext.etag,
      metadata: {
        sources: updateContext.sources.map((source) => ({
          ...(source.type ? { type: source.type } : {}),
          ...(source.id ? { id: source.id } : {}),
          etag: source.etag
        }))
      }
    };

    for (const field of updatePersonFields) {
      if (field === 'names') {
        requestBody['names'] = this.toGoogleNameFieldPayload(mergedNames);
        continue;
      }

      if (field === 'emailAddresses') {
        requestBody['emailAddresses'] = this.toGoogleValueFieldPayload(mergedEmailAddresses);
        continue;
      }

      if (field === 'phoneNumbers') {
        requestBody['phoneNumbers'] = this.toGoogleValueFieldPayload(mergedPhoneNumbers);
        continue;
      }

      requestBody['biographies'] = this.toGoogleSingletonValueFieldPayload(mergedBiographies);
    }

    const resourceNamePath = encodeURIComponent(command.resourceName).replace(/%2F/g, '/');
    const url = new URL(`${GooglePeopleApiAdapter.PEOPLE_API_BASE}/${resourceNamePath}:updateContact`);
    url.searchParams.set('updatePersonFields', updatePersonFields.join(','));

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People updateContact failed: ${response.status} ${response.statusText}. ${body}`);
    }

    return this.requireMappedPerson(await response.json());
  }

  public async deleteContact(accessToken: string, command: DeleteGoogleContactCommand): Promise<void> {
    const resourceNamePath = encodeURIComponent(command.resourceName).replace(/%2F/g, '/');
    const url = `${GooglePeopleApiAdapter.PEOPLE_API_BASE}/${resourceNamePath}:deleteContact`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People deleteContact failed: ${response.status} ${response.statusText}. ${body}`);
    }
  }

  private async getContactUpdateContext(
    accessToken: string,
    resourceName: string
  ): Promise<GoogleContactUpdateContext> {
    const resourceNamePath = encodeURIComponent(resourceName).replace(/%2F/g, '/');
    const url = new URL(`${GooglePeopleApiAdapter.PEOPLE_API_BASE}/${resourceNamePath}`);
    url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,biographies,metadata');
    url.searchParams.append('sources', 'READ_SOURCE_TYPE_CONTACT');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Google People get contact for update failed: ${response.status} ${response.statusText}. ${body}`
      );
    }

    const payload = (await response.json()) as GooglePersonPayload;
    const mappedContact = this.mapGooglePerson(payload);
    if (!mappedContact) {
      throw new Error(`Google People get contact for update returned invalid payload for "${resourceName}".`);
    }

    const sourceCandidates = this.extractSourcesForUpdate(payload);

    if (sourceCandidates.length === 0) {
      throw new Error(
        `Google People updateContact requires metadata.sources, but none were returned for "${resourceName}".`
      );
    }

    const effectiveEtag =
      (typeof payload.etag === 'string' && payload.etag.trim().length > 0 ? payload.etag.trim() : '') ||
      sourceCandidates[0]?.etag ||
      '';

    if (effectiveEtag.length === 0) {
      throw new Error(
        `Google People updateContact cannot continue for "${resourceName}" because no etag is available.`
      );
    }

    return {
      contact: mappedContact,
      etag: effectiveEtag,
      sources: sourceCandidates
    };
  }

  private extractSourcesForUpdate(person: GooglePersonPayload): GoogleContactSourceForUpdate[] {
    const metadata =
      person.metadata && typeof person.metadata === 'object'
        ? (person.metadata as GooglePersonMetadataPayload)
        : null;
    const rawSources = metadata && Array.isArray(metadata.sources) ? metadata.sources : [];
    const mappedSources = rawSources
      .map((rawSource) => this.mapSourceForUpdate(rawSource))
      .filter((source): source is GoogleContactSourceForUpdate => source !== null);
    const contactSources = mappedSources.filter((source) => source.type === 'CONTACT');

    if (contactSources.length > 0) {
      return contactSources;
    }

    return mappedSources;
  }

  private mapSourceForUpdate(rawSource: unknown): GoogleContactSourceForUpdate | null {
    if (!rawSource || typeof rawSource !== 'object') {
      return null;
    }

    const source = rawSource as GooglePersonSourcePayload;
    const etag = typeof source.etag === 'string' ? source.etag.trim() : '';
    if (!etag) {
      return null;
    }

    const type = typeof source.type === 'string' && source.type.trim().length > 0
      ? source.type.trim()
      : undefined;
    const id = typeof source.id === 'string' && source.id.trim().length > 0
      ? source.id.trim()
      : undefined;

    return {
      type,
      id,
      etag
    };
  }

  private buildCreateContactRequestBody(command: CreateGoogleContactCommand): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {};
    const namesProvided = command.names !== undefined;
    const emailAddressesProvided = command.emailAddresses !== undefined;
    const phoneNumbersProvided = command.phoneNumbers !== undefined;
    const biographiesProvided = command.biographies !== undefined;

    const names = this.normalizeTextArray(command.names);
    const emailAddresses = this.normalizeTextArray(command.emailAddresses);
    const phoneNumbers = this.normalizeTextArray(command.phoneNumbers);
    const biographies = this.normalizeTextArray(command.biographies);

    if (!names.length && !emailAddresses.length && !phoneNumbers.length && !biographies.length) {
      throw new Error(
        'Google People createContact requires at least one non-empty value in names, emailAddresses, phoneNumbers, or biographies.'
      );
    }

    if (namesProvided) {
      requestBody['names'] = this.toGoogleNameFieldPayload(names);
    }

    if (emailAddressesProvided) {
      requestBody['emailAddresses'] = this.toGoogleValueFieldPayload(emailAddresses);
    }

    if (phoneNumbersProvided) {
      requestBody['phoneNumbers'] = this.toGoogleValueFieldPayload(phoneNumbers);
    }

    if (biographiesProvided) {
      requestBody['biographies'] = this.toGoogleSingletonValueFieldPayload(biographies);
    }

    return requestBody;
  }

  private extractPatchFields(command: PatchGoogleContactCommand): GoogleContactPatchField[] {
    const fields: GoogleContactPatchField[] = [];

    if (command.names !== undefined) {
      fields.push('names');
    }

    if (command.emailAddresses !== undefined) {
      fields.push('emailAddresses');
    }

    if (command.phoneNumbers !== undefined) {
      fields.push('phoneNumbers');
    }

    if (command.biographies !== undefined) {
      fields.push('biographies');
    }

    return fields;
  }

  private normalizeTextArray(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values.map((value) => value.trim()).filter((value) => value.length > 0);
  }

  private toGoogleNameFieldPayload(values: string[]): Array<{ givenName: string }> {
    const normalizedValues = this.normalizeTextArray(values);
    const first = normalizedValues[0];

    if (!first) {
      return [];
    }

    return [{ givenName: first }];
  }

  private toGoogleSingletonValueFieldPayload(values: string[]): Array<{ value: string }> {
    const normalizedValues = this.normalizeTextArray(values);
    const first = normalizedValues[0];

    if (!first) {
      return [];
    }

    return [{ value: first }];
  }

  private toGoogleValueFieldPayload(values: string[]): Array<{ value: string }> {
    const normalizedValues = this.normalizeTextArray(values);
    return normalizedValues.map((value) => ({ value }));
  }

  private mapGoogleNameField(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => this.mapSingleGoogleName(item))
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private mapSingleGoogleName(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const name = raw as GooglePersonNamePayload;
    if (typeof name.displayName === 'string' && name.displayName.trim().length > 0) {
      return name.displayName;
    }

    if (typeof name.unstructuredName === 'string' && name.unstructuredName.trim().length > 0) {
      return name.unstructuredName;
    }

    const givenName = typeof name.givenName === 'string' ? name.givenName.trim() : '';
    const familyName = typeof name.familyName === 'string' ? name.familyName.trim() : '';
    const combined = `${givenName} ${familyName}`.trim();

    return combined.length > 0 ? combined : null;
  }

  private mapGoogleValueField(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => (item as { value?: unknown }).value)
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private async requestToken(tokenUri: string, form: Record<string, string>): Promise<GoogleTokenPayload> {
    const body = new URLSearchParams(form);

    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google OAuth token exchange failed: ${response.status} ${response.statusText}. ${text}`);
    }

    return (await response.json()) as GoogleTokenPayload;
  }

  private mapTokenPayload(payload: GoogleTokenPayload): GoogleTokenSet {
    if (typeof payload.access_token !== 'string' || payload.access_token.trim().length === 0) {
      throw new Error('Google OAuth token response missing access_token.');
    }

    const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : typeof payload.expires_in === 'string' && Number.isFinite(Number(payload.expires_in))
        ? Number(payload.expires_in)
        : null;

    return {
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
      expiryDateMs: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
      tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
      scope: typeof payload.scope === 'string' ? payload.scope : undefined
    };
  }

  private requireMappedPerson(raw: unknown): GoogleContact {
    const mapped = this.mapGooglePerson(raw);

    if (!mapped) {
      throw new Error('Google People response is invalid for contact mapping.');
    }

    return mapped;
  }

  private mapGooglePerson(raw: unknown): GoogleContact | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const person = raw as GooglePersonPayload;
    const resourceName = typeof person.resourceName === 'string' ? person.resourceName : '';

    if (!resourceName) {
      return null;
    }

    const names = this.mapGoogleNameField(person.names);
    const emailAddresses = this.mapGoogleValueField(person.emailAddresses);
    const phoneNumbers = this.mapGoogleValueField(person.phoneNumbers);
    const biographies = this.mapGoogleValueField(person.biographies);

    return {
      resourceName,
      etag: typeof person.etag === 'string' ? person.etag : undefined,
      displayName: names[0] ?? '',
      names,
      emailAddresses,
      phoneNumbers,
      biographies
    };
  }
}
