import { Injectable } from '@nestjs/common';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

export type MongoConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

export type LlmConfig = {
  baseUrl: string;
  healthEndpoint: string;
  healthUrl: string;
};

export type ContactsBackendConfig = {
  baseUrl: string;
};

export type EmbeddingConfig = {
  provider: string;
  host: string;
  port: number;
};

export type QdrantConfig = {
  url: string;
  apiKey?: string;
  collectionName: string;
};

export type CorsConfig = {
  allowedOrigins: string[];
  allowedNetworkCidr?: string;
};

@Injectable()
export class ServiceConfig {
  constructor(
    private readonly settingsConfig: SettingsConfig,
    private readonly secretsConfig: SecretsConfig
  ) {}

  public get port(): number {
    return this.readPositiveInt('PORT', this.secretsConfig.values.service.port);
  }

  public get startupFailurePauseMs(): number {
    return this.readPositiveInt(
      'STARTUP_FAILURE_PAUSE_MINUTES',
      this.settingsConfig.values.service.startupFailurePauseMinutes
    ) * 60_000;
  }

  public get mongoConfig(): MongoConfig {
    const host = process.env.MONGO_HOST?.trim() || this.secretsConfig.values.mongo.host;
    const port = this.readPositiveInt('MONGO_PORT', this.secretsConfig.values.mongo.port);
    const database = process.env.MONGO_DATABASE?.trim() || this.secretsConfig.values.mongo.database;
    const username = process.env.MONGO_USERNAME?.trim() || this.secretsConfig.values.mongo.username;
    const password = process.env.MONGO_PASSWORD?.trim() || this.secretsConfig.values.mongo.password;

    return {
      host,
      port,
      database,
      username,
      password
    };
  }

  public get llmConfig(): LlmConfig {
    const baseUrl = this.normalizeUrl(process.env.LLM_BASE_URL?.trim() || this.secretsConfig.values.llm.baseUrl);
    const healthEndpoint = this.normalizeEndpoint(
      process.env.LLM_HEALTH_ENDPOINT?.trim() || this.secretsConfig.values.llm.healthEndpoint
    );

    return {
      baseUrl,
      healthEndpoint,
      healthUrl: `${baseUrl}${healthEndpoint}`
    };
  }

  public get contactsBackendConfig(): ContactsBackendConfig {
    const baseUrl = this.normalizeUrl(
      process.env.CONTACTS_BACKEND_BASE_URL?.trim() || this.secretsConfig.values.contactsBackend.baseUrl
    );

    return { baseUrl };
  }

  public get embeddingConfig(): EmbeddingConfig {
    const provider = process.env.EMBEDDING_PROVIDER?.trim() || this.secretsConfig.values.embedding.provider;
    const host = process.env.EMBEDDING_HOST?.trim() || this.secretsConfig.values.embedding.host;
    const port = this.readPositiveInt('EMBEDDING_PORT', this.secretsConfig.values.embedding.port);

    return {
      provider,
      host,
      port
    };
  }

  public get qdrantConfig(): QdrantConfig {
    const url = this.normalizeUrl(process.env.QDRANT_URL?.trim() || this.secretsConfig.values.qdrant.url);
    const apiKey = process.env.QDRANT_API_KEY?.trim() || this.secretsConfig.values.qdrant.apiKey;
    const collectionName = this.resolveQdrantCollectionName();

    return {
      url,
      apiKey: apiKey?.trim() ? apiKey.trim() : undefined,
      collectionName: collectionName.trim()
    };
  }

  public get corsConfig(): CorsConfig {
    return {
      allowedOrigins: this.secretsConfig.values.cors.allowedOrigins.map((origin) => origin.trim()),
      allowedNetworkCidr: this.secretsConfig.values.cors.allowedNetworkCidr?.trim()
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

  private normalizeEndpoint(endpoint: string): string {
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }

  private normalizeUrl(url: string): string {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, '');
  }

  private resolveQdrantCollectionName(): string {
    const envCollectionName = process.env.QDRANT_COLLECTION_NAME?.trim();
    if (envCollectionName) {
      return envCollectionName;
    }

    const secretsCollectionName = this.secretsConfig.values.qdrant.collectionName?.trim();
    if (secretsCollectionName) {
      return secretsCollectionName;
    }

    return 'whatsapp_message_chunks';
  }
}
