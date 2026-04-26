import { Injectable } from '@nestjs/common';
import { SecretsConfig } from './settings/secrets.config';

@Injectable()
export class ServiceConfig {
  constructor(private readonly secretsConfig: SecretsConfig) {}

  get port(): number {
    return this.readPositiveInt('PORT', this.secretsConfig.values.service.port);
  }

  get contactsBackendBaseUrl(): string {
    return this.normalizeUrl(this.secretsConfig.values.contactsBackend.baseUrl);
  }

  get contactsBackendPageSize(): number {
    return this.secretsConfig.values.contactsBackend.pageSize;
  }

  get contactsBackendRequestTimeoutMs(): number {
    return this.secretsConfig.values.contactsBackend.requestTimeoutMs;
  }

  private readPositiveInt(name: string, fallback: number): number {
    const rawValue = process.env[name];

    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error(`${name} must be an integer between 1 and 65535.`);
    }

    return parsed;
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, '');
  }
}
