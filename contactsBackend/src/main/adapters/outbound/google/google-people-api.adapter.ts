import { Injectable } from '@nestjs/common';
import type { GoogleAuthPort, ExchangeCodeForTokenCommand } from '../../../application/ports/outbound/google/google-auth.port';
import type { CreateGoogleContactCommand, GoogleContact, GooglePeoplePort, ListGoogleContactsResult, UpdateGoogleContactCommand } from '../../../application/ports/outbound/google/google-people.port';
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
  names?: unknown;
  phoneNumbers?: unknown;
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
    const response = await fetch(`${GooglePeopleApiAdapter.PEOPLE_API_BASE}/people:createContact`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        names: [{ displayName: command.displayName }],
        phoneNumbers: [{ value: command.phoneNumber }]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People createContact failed: ${response.status} ${response.statusText}. ${body}`);
    }

    return this.requireMappedPerson(await response.json());
  }

  public async updateContact(accessToken: string, command: UpdateGoogleContactCommand): Promise<GoogleContact> {
    const resourceNamePath = encodeURIComponent(command.resourceName).replace(/%2F/g, '/');
    const url = `${GooglePeopleApiAdapter.PEOPLE_API_BASE}/${resourceNamePath}:updateContact?updatePersonFields=names,phoneNumbers`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resourceName: command.resourceName,
        etag: command.etag,
        names: [{ displayName: command.displayName }],
        phoneNumbers: [{ value: command.phoneNumber }]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google People updateContact failed: ${response.status} ${response.statusText}. ${body}`);
    }

    return this.requireMappedPerson(await response.json());
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

    const names = Array.isArray(person.names) ? person.names : [];
    const firstName = names[0] as { displayName?: unknown } | undefined;
    const displayName = typeof firstName?.displayName === 'string' ? firstName.displayName : '';

    const phoneNumbersRaw = Array.isArray(person.phoneNumbers) ? person.phoneNumbers : [];
    const phoneNumbers = phoneNumbersRaw
      .map((item) => (item as { value?: unknown }).value)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    return {
      resourceName,
      etag: typeof person.etag === 'string' ? person.etag : undefined,
      displayName,
      phoneNumbers
    };
  }
}
