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
    if (!loadedSecrets.retrievalBackend?.baseUrl?.trim()) {
      throw new Error('Missing retrievalBackend.baseUrl in secrets.json');
    }
    if (!loadedSecrets.staticAssets?.baseUrl?.trim()) {
      throw new Error('Missing staticAssets.baseUrl in secrets.json');
    }

    this.secrets = {
      backend: {
        baseUrl: this.normalizeHttpBaseUrl(loadedSecrets.backend.baseUrl, 'backend.baseUrl')
      },
      retrievalBackend: {
        baseUrl: this.normalizeHttpBaseUrl(
          loadedSecrets.retrievalBackend.baseUrl,
          'retrievalBackend.baseUrl'
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

  private normalizeHttpBaseUrl(urlValue: string, key: string): string {
    const trimmed = urlValue.trim();
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid ${key} in secrets.json. It must use http:// or https://`);
    }

    return parsed.toString().replace(/\/+$/, '');
  }
}
