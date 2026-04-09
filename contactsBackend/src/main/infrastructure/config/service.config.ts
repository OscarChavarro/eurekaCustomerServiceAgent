import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

export type GoogleOauthWebConfig = {
  clientId: string;
  projectId: string;
  authUri: string;
  tokenUri: string;
  authProviderCertsUrl: string;
  clientSecret: string;
  redirectUri: string;
};

export type CorsConfig = {
  allowedOrigins: string[];
  allowedNetworkCidr: string | null;
};

@Injectable()
export class ServiceConfig {
  constructor(
    private readonly settingsConfig: SettingsConfig,
    private readonly secretsConfig: SecretsConfig
  ) {}

  public get port(): number {
    return this.readPositiveInt('PORT', this.settingsConfig.values.api.httpPort);
  }

  public get oauthStateTtlMs(): number {
    return this.settingsConfig.values.service.oauthStateTtlMinutes * 60_000;
  }

  public get authSessionFilePath(): string {
    return resolve(process.cwd(), this.settingsConfig.values.service.authSessionFilePath);
  }

  public get googleOauthWebConfig(): GoogleOauthWebConfig {
    const web = this.secretsConfig.values.web;

    return {
      clientId: web.client_id,
      projectId: web.project_id,
      authUri: this.normalizeUrl(web.auth_uri),
      tokenUri: this.normalizeUrl(web.token_uri),
      authProviderCertsUrl: this.normalizeUrl(web.auth_provider_x509_cert_url),
      clientSecret: web.client_secret,
      redirectUri: web.redirect_uris[0] ?? ''
    };
  }

  public get corsConfig(): CorsConfig {
    const cors = this.secretsConfig.values.cors;

    return {
      allowedOrigins: cors.allowedOrigins.map((origin) => this.normalizeOrigin(origin)),
      allowedNetworkCidr: this.normalizeCidr(cors.allowedNetworkCidr)
    };
  }

  private readPositiveInt(name: string, fallback: number): number {
    const rawValue = process.env[name];

    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, '');
  }

  private normalizeOrigin(origin: string): string {
    const parsed = new URL(origin);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid CORS origin "${origin}". It must use http:// or https://`);
    }

    return parsed.origin;
  }

  private normalizeCidr(cidr: string | undefined): string | null {
    const normalized = cidr?.trim();

    if (!normalized) {
      return null;
    }

    return normalized;
  }
}
