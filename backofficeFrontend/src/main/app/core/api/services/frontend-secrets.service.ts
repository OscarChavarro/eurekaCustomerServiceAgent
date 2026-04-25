import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { FrontendSecrets } from '../model/frontend-secrets.model';

@Injectable({ providedIn: 'root' })
export class FrontendSecretsService {
  private readonly httpClient = inject(HttpClient);
  private secrets: FrontendSecrets | null = null;

  public async load(): Promise<void> {
    const loadedSecrets = await firstValueFrom(
      this.httpClient.get<FrontendSecrets>('/secrets.json')
    );

    if (!loadedSecrets.backend?.baseUrl?.trim()) {
      throw new Error('Missing backend.baseUrl in secrets.json');
    }
    if (!loadedSecrets.contacts?.prospectPreffix?.trim()) {
      throw new Error('Missing contacts.prospectPreffix in secrets.json');
    }
    if (!loadedSecrets.contactsBackend?.baseUrl?.trim()) {
      throw new Error('Missing contactsBackend.baseUrl in secrets.json');
    }
    if (!loadedSecrets.retrievalBackend?.baseUrl?.trim()) {
      throw new Error('Missing retrievalBackend.baseUrl in secrets.json');
    }
    if (!loadedSecrets.whatsappConnectorBackend?.baseUrl?.trim()) {
      throw new Error('Missing whatsappConnectorBackend.baseUrl in secrets.json');
    }
    if (!loadedSecrets.staticAssets?.baseUrl?.trim()) {
      throw new Error('Missing staticAssets.baseUrl in secrets.json');
    }

    this.secrets = {
      backend: {
        baseUrl: this.normalizeHttpBaseUrl(loadedSecrets.backend.baseUrl, 'backend.baseUrl')
      },
      contacts: {
        prospectPreffix: this.normalizeProspectPreffix(
          loadedSecrets.contacts.prospectPreffix,
          'contacts.prospectPreffix'
        )
      },
      contactsBackend: {
        baseUrl: this.normalizeHttpBaseUrl(
          loadedSecrets.contactsBackend.baseUrl,
          'contactsBackend.baseUrl'
        )
      },
      retrievalBackend: {
        baseUrl: this.normalizeHttpBaseUrl(
          loadedSecrets.retrievalBackend.baseUrl,
          'retrievalBackend.baseUrl'
        )
      },
      whatsappConnectorBackend: {
        baseUrl: this.normalizeHttpBaseUrl(
          loadedSecrets.whatsappConnectorBackend.baseUrl,
          'whatsappConnectorBackend.baseUrl'
        )
      },
      staticAssets: {
        baseUrl: this.normalizeHttpBaseUrl(
          loadedSecrets.staticAssets.baseUrl,
          'staticAssets.baseUrl'
        )
      }
    };
  }

  public get backendBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.backend.baseUrl;
  }

  public get contactsBackendBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.contactsBackend.baseUrl;
  }

  public get contactsProspectPreffix(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.contacts.prospectPreffix;
  }

  public get staticAssetsBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.staticAssets.baseUrl;
  }

  public get retrievalBackendBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.retrievalBackend.baseUrl;
  }

  public get whatsappConnectorBackendBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.whatsappConnectorBackend.baseUrl;
  }

  private normalizeHttpBaseUrl(urlValue: string, key: string): string {
    const trimmed = urlValue.trim();
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid ${key} in secrets.json. It must use http:// or https://`);
    }

    return parsed.toString().replace(/\/+$/, '');
  }

  private normalizeProspectPreffix(value: string, key: string): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid ${key} in secrets.json. It must be a non-empty string.`);
    }

    if (value.length === 0) {
      throw new Error(`Invalid ${key} in secrets.json. It must be a non-empty string.`);
    }

    if (value.trim().length === 0) {
      throw new Error(`Invalid ${key} in secrets.json. It must include at least one non-space character.`);
    }

    return value;
  }
}
