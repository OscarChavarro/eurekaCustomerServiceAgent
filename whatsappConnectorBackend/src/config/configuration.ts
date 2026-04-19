import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Environment = {
  whatsapp?: {
    messageReceiveMode?: string;
  };
  service?: {
    startupLogPrefix?: string;
    httpPort?: number;
  };
  whiskeysocketswhatsapp?: {
    authFolderPath?: string;
    printQrInTerminal?: boolean;
    markOnlineOnConnect?: boolean;
    connectTimeoutMs?: number;
    reconnectDelayMs?: number;
    reconnectDelayOnStatusCode405Ms?: number;
  };
};

type Secrets = {
  cors?: {
    allowedOrigins?: string[];
    allowedIps?: string[];
    allowedIpRanges?: string[];
  };
  profileImages?: {
    baseFolderPath?: string;
  };
  contactsBackend?: {
    host?: string;
    port?: number;
    pageSize?: number;
    requestTimeoutMs?: number;
  };
  retrievalBackend?: {
    baseUrl?: string;
  };
  whiskeysocketswhatsapp?: {
    accountPhoneNumber?: string;
    accountLabel?: string;
  };
};

@Injectable()
export class Configuration {
  private readonly environment: Environment;
  private readonly secrets: Secrets;

  constructor() {
    const raw = readFileSync(join(process.cwd(), 'environment.json'), 'utf-8');
    this.environment = JSON.parse(raw) as Environment;

    const secretsPath = join(process.cwd(), 'secrets.json');
    if (!existsSync(secretsPath)) {
      console.log(
        'Copy secrets-example.json to secrets.json and define WhatsApp credentials/settings for this micro service.'
      );
      process.exit(1);
    }

    const secretsRaw = readFileSync(secretsPath, 'utf-8');
    this.secrets = JSON.parse(secretsRaw) as Secrets;
    this.validateCorsSecrets(secretsPath);
    this.validateContactsBackendSecrets(secretsPath);
    this.validateRetrievalBackendSecrets(secretsPath);
  }

  get serviceStartupLogPrefix(): string {
    return this.environment.service?.startupLogPrefix?.trim() || 'whatsappConnectorBackend';
  }

  get serviceHttpPort(): number {
    return Math.max(1, this.environment.service?.httpPort ?? 3670);
  }

  get corsAllowedOrigins(): string[] {
    return this.normalizeStringArray(this.secrets.cors?.allowedOrigins);
  }

  get corsAllowedIps(): string[] {
    return this.normalizeStringArray(this.secrets.cors?.allowedIps);
  }

  get corsAllowedIpRanges(): string[] {
    return this.normalizeStringArray(this.secrets.cors?.allowedIpRanges);
  }

  get whiskeySocketsWhatsappAuthFolderPath(): string {
    return this.environment.whiskeysocketswhatsapp?.authFolderPath ?? './output/whatsapp-auth';
  }

  get whiskeySocketsWhatsappPrintQrInTerminal(): boolean {
    return this.environment.whiskeysocketswhatsapp?.printQrInTerminal ?? true;
  }

  get whiskeySocketsWhatsappMarkOnlineOnConnect(): boolean {
    return this.environment.whiskeysocketswhatsapp?.markOnlineOnConnect ?? false;
  }

  get whiskeySocketsWhatsappConnectTimeoutMs(): number {
    return Math.max(1000, this.environment.whiskeysocketswhatsapp?.connectTimeoutMs ?? 60000);
  }

  get whiskeySocketsWhatsappReconnectDelayMs(): number {
    return Math.max(1000, this.environment.whiskeysocketswhatsapp?.reconnectDelayMs ?? 5000);
  }

  get whiskeySocketsWhatsappReconnectDelayOnStatusCode405Ms(): number {
    return Math.max(
      this.whiskeySocketsWhatsappReconnectDelayMs,
      this.environment.whiskeysocketswhatsapp?.reconnectDelayOnStatusCode405Ms ?? 600000
    );
  }

  get whiskeySocketsWhatsappAccountPhoneNumber(): string {
    return this.secrets.whiskeysocketswhatsapp?.accountPhoneNumber?.trim() ?? '';
  }

  get whiskeySocketsWhatsappAccountLabel(): string {
    return this.secrets.whiskeysocketswhatsapp?.accountLabel?.trim() ?? '';
  }

  get contactsBackendHost(): string {
    return this.secrets.contactsBackend?.host?.trim() ?? '';
  }

  get contactsBackendPort(): number {
    return this.secrets.contactsBackend?.port ?? 0;
  }

  get contactsBackendPageSize(): number {
    return this.secrets.contactsBackend?.pageSize ?? 100;
  }

  get contactsBackendRequestTimeoutMs(): number {
    return this.secrets.contactsBackend?.requestTimeoutMs ?? 10000;
  }

  get contactsBackendBaseUrl(): string {
    const host = this.contactsBackendHost;
    const port = this.contactsBackendPort;
    const normalizedHost = host.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');

    return `http://${normalizedHost}:${port}`;
  }

  get retrievalBackendBaseUrl(): string {
    return this.secrets.retrievalBackend?.baseUrl?.trim().replace(/\/+$/g, '') ?? '';
  }

  get profileImagesBaseFolderPath(): string {
    const configured = this.secrets.profileImages?.baseFolderPath?.trim();
    return configured && configured.length > 0 ? configured : './output/images';
  }

  get whatsappMessageReceiveMode(): 'WHATSAPP_ID' | 'JSON' | 'SILENT' {
    const configuredMode = this.environment.whatsapp?.messageReceiveMode ?? 'WHATSAPP_ID';
    const normalizedMode = configuredMode.trim().toUpperCase();
    if (
      normalizedMode === 'JSON' ||
      normalizedMode === 'WHATSAPP_ID' ||
      normalizedMode === 'SILENT'
    ) {
      return normalizedMode;
    }

    return 'WHATSAPP_ID';
  }

  private validateContactsBackendSecrets(secretsPath: string): void {
    const contactsBackend = this.secrets.contactsBackend;
    if (!contactsBackend || typeof contactsBackend !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "contactsBackend" object is required.`);
    }

    if (typeof contactsBackend.host !== 'string' || contactsBackend.host.trim().length === 0) {
      throw new Error(
        `Invalid configuration in ${secretsPath}. "contactsBackend.host" must be a non-empty string.`
      );
    }

    if (
      typeof contactsBackend.port !== 'number' ||
      !Number.isInteger(contactsBackend.port) ||
      contactsBackend.port <= 0 ||
      contactsBackend.port > 65535
    ) {
      throw new Error(
        `Invalid configuration in ${secretsPath}. "contactsBackend.port" must be an integer between 1 and 65535.`
      );
    }

    if (
      contactsBackend.pageSize !== undefined &&
      (!Number.isInteger(contactsBackend.pageSize) ||
        contactsBackend.pageSize <= 0 ||
        contactsBackend.pageSize > 1000)
    ) {
      throw new Error(
        `Invalid configuration in ${secretsPath}. "contactsBackend.pageSize" must be an integer between 1 and 1000.`
      );
    }

    if (
      contactsBackend.requestTimeoutMs !== undefined &&
      (!Number.isInteger(contactsBackend.requestTimeoutMs) || contactsBackend.requestTimeoutMs <= 0)
    ) {
      throw new Error(
        `Invalid configuration in ${secretsPath}. "contactsBackend.requestTimeoutMs" must be a positive integer.`
      );
    }
  }

  private validateCorsSecrets(secretsPath: string): void {
    const cors = this.secrets.cors;
    if (cors === undefined) {
      return;
    }

    if (!cors || typeof cors !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "cors" must be an object.`);
    }

    this.validateStringArray(secretsPath, 'cors.allowedOrigins', cors.allowedOrigins);
    this.validateIpv4Array(secretsPath, 'cors.allowedIps', cors.allowedIps);
    this.validateCidrArray(secretsPath, 'cors.allowedIpRanges', cors.allowedIpRanges);
  }

  private validateRetrievalBackendSecrets(secretsPath: string): void {
    const retrievalBackend = this.secrets.retrievalBackend;
    if (!retrievalBackend || typeof retrievalBackend !== 'object') {
      throw new Error(`Invalid configuration in ${secretsPath}. "retrievalBackend" object is required.`);
    }

    if (typeof retrievalBackend.baseUrl !== 'string' || retrievalBackend.baseUrl.trim().length === 0) {
      throw new Error(
        `Invalid configuration in ${secretsPath}. "retrievalBackend.baseUrl" must be a non-empty string.`
      );
    }
  }

  private normalizeStringArray(values?: string[]): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return Array.from(
      new Set(
        values
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );
  }

  private validateStringArray(secretsPath: string, propertyName: string, values?: string[]): void {
    if (values === undefined) {
      return;
    }

    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
      throw new Error(`Invalid configuration in ${secretsPath}. "${propertyName}" must be an array of strings.`);
    }
  }

  private validateIpv4Array(secretsPath: string, propertyName: string, values?: string[]): void {
    this.validateStringArray(secretsPath, propertyName, values);
    for (const value of this.normalizeStringArray(values)) {
      if (!this.isValidIpv4(value)) {
        throw new Error(`Invalid configuration in ${secretsPath}. "${propertyName}" contains invalid IPv4 "${value}".`);
      }
    }
  }

  private validateCidrArray(secretsPath: string, propertyName: string, values?: string[]): void {
    this.validateStringArray(secretsPath, propertyName, values);
    for (const value of this.normalizeStringArray(values)) {
      if (!this.isValidIpv4Cidr(value)) {
        throw new Error(`Invalid configuration in ${secretsPath}. "${propertyName}" contains invalid CIDR "${value}".`);
      }
    }
  }

  private isValidIpv4(value: string): boolean {
    const parts = value.split('.');
    if (parts.length !== 4) {
      return false;
    }

    return parts.every((part) => {
      if (!/^\d+$/.test(part)) {
        return false;
      }

      const octet = Number(part);
      return octet >= 0 && octet <= 255;
    });
  }

  private isValidIpv4Cidr(value: string): boolean {
    const [ip, prefix] = value.split('/');
    if (!ip || !prefix || !/^\d+$/.test(prefix)) {
      return false;
    }

    const prefixNumber = Number(prefix);
    return this.isValidIpv4(ip) && prefixNumber >= 0 && prefixNumber <= 32;
  }
}
