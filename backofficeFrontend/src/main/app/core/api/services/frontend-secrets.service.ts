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

    this.secrets = {
      backend: {
        baseUrl: loadedSecrets.backend.baseUrl.trim().replace(/\/$/, '')
      }
    };
  }

  public get backendBaseUrl(): string {
    if (!this.secrets) {
      throw new Error('Frontend secrets not loaded yet.');
    }

    return this.secrets.backend.baseUrl;
  }
}
