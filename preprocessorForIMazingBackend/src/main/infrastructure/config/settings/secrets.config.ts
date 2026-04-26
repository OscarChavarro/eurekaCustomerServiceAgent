import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ContactsBackendSecretsSettings,
  SecretsSettings,
  ServiceSecretsSettings
} from './secrets-settings.type';

@Injectable()
export class SecretsConfig {
  readonly values: SecretsSettings;

  constructor() {
    const secretsPath = join(process.cwd(), 'secrets.json');

    if (!existsSync(secretsPath)) {
      throw new Error(`secrets.json not found at ${secretsPath}. Create it from secrets-example.json.`);
    }

    const raw = readFileSync(secretsPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${secretsPath}.`);
    }

    this.values = this.validate(parsed, secretsPath);
  }

  private validate(parsed: unknown, secretsPath: string): SecretsSettings {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. Expected a JSON object.`);
    }

    const maybeSettings = parsed as { service?: unknown; contactsBackend?: unknown };
    return {
      service: this.validateService(maybeSettings.service, secretsPath),
      contactsBackend: this.validateContactsBackend(maybeSettings.contactsBackend, secretsPath)
    };
  }

  private validateService(value: unknown, secretsPath: string): ServiceSecretsSettings {
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "service" object is required.`);
    }

    const service = value as { port?: unknown };
    if (
      typeof service.port !== 'number' ||
      !Number.isInteger(service.port) ||
      service.port <= 0 ||
      service.port > 65535
    ) {
      throw new Error(`Invalid configuration in ${secretsPath}. "service.port" must be an integer between 1 and 65535.`);
    }

    return {
      port: service.port
    };
  }

  private validateContactsBackend(value: unknown, secretsPath: string): ContactsBackendSecretsSettings {
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend" object is required.`);
    }

    const contactsBackend = value as {
      baseUrl?: unknown;
      pageSize?: unknown;
      requestTimeoutMs?: unknown;
    };

    if (typeof contactsBackend.baseUrl !== 'string' || contactsBackend.baseUrl.trim().length === 0) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.baseUrl" must be a non-empty string.`);
    }

    const { pageSize, requestTimeoutMs } = contactsBackend;

    if (pageSize !== undefined && (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 1000)) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.pageSize" must be an integer between 1 and 1000.`);
    }

    if (requestTimeoutMs !== undefined && (typeof requestTimeoutMs !== 'number' || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0)) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.requestTimeoutMs" must be a positive integer.`);
    }

    return {
      baseUrl: contactsBackend.baseUrl.trim().replace(/\/+$/g, ''),
      pageSize: pageSize ?? 100,
      requestTimeoutMs: requestTimeoutMs ?? 10000
    };
  }
}
