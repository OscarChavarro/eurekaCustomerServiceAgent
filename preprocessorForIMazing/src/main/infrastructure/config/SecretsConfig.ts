import * as path from 'path';
import { readFile } from 'fs/promises';

type ContactsBackendSecrets = {
  baseUrl: string;
  pageSize?: number;
  requestTimeoutMs?: number;
};

type SecretsFile = {
  contactsBackend: ContactsBackendSecrets;
};

export class SecretsConfig {
  async load(): Promise<ContactsBackendSecrets> {
    const secretsPath: string = path.join(process.cwd(), 'secrets.json');
    const raw = await this.readSecretsFile(secretsPath);
    const parsed = this.parseSecrets(raw, secretsPath);
    return this.validateContactsBackendSettings(parsed, secretsPath);
  }

  private async readSecretsFile(secretsPath: string): Promise<string> {
    try {
      return await readFile(secretsPath, 'utf-8');
    } catch {
      throw new Error(`secrets.json not found at ${secretsPath}. Create it from secrets-example.json.`);
    }
  }

  private parseSecrets(raw: string, secretsPath: string): SecretsFile {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${secretsPath}.`);
    }

    return parsed as SecretsFile;
  }

  private validateContactsBackendSettings(parsed: SecretsFile, secretsPath: string): ContactsBackendSecrets {
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. Expected a JSON object.`);
    }

    const contactsBackend: ContactsBackendSecrets | undefined = parsed.contactsBackend;
    if (contactsBackend === undefined || typeof contactsBackend !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend" object is required.`);
    }

    const baseUrl: string | undefined = contactsBackend.baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.baseUrl" must be a non-empty string.`);
    }

    if (
      contactsBackend.pageSize !== undefined &&
      (!Number.isInteger(contactsBackend.pageSize) || contactsBackend.pageSize <= 0 || contactsBackend.pageSize > 1000)
    ) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.pageSize" must be an integer between 1 and 1000.`);
    }

    if (
      contactsBackend.requestTimeoutMs !== undefined &&
      (!Number.isInteger(contactsBackend.requestTimeoutMs) || contactsBackend.requestTimeoutMs <= 0)
    ) {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend.requestTimeoutMs" must be a positive integer.`);
    }

    return {
      baseUrl: baseUrl.trim().replace(/\/+$/g, ''),
      pageSize: contactsBackend.pageSize,
      requestTimeoutMs: contactsBackend.requestTimeoutMs
    };
  }
}
