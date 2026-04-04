import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

export type EmbeddingConfig = {
  provider: string;
  host: string;
  port: number;
};

export type MongoConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

@Injectable()
export class ServiceConfig {
  constructor(
    private readonly settingsConfig: SettingsConfig,
    private readonly secretsConfig: SecretsConfig
  ) {}

  public get port(): number {
    return this.readPositiveInt('PORT', this.settingsConfig.values.service.port);
  }

  public get qdrantUrl(): string {
    return this.normalizeUrl(process.env.QDRANT_URL?.trim() || this.secretsConfig.values.qdrant.url);
  }

  public get qdrantApiKey(): string | undefined {
    const rawValue = process.env.QDRANT_API_KEY?.trim() ?? this.secretsConfig.values.qdrant.apiKey;
    return rawValue ? rawValue.trim() : undefined;
  }

  public get qdrantCollectionName(): string {
    return (
      process.env.QDRANT_COLLECTION_NAME?.trim() ||
      this.settingsConfig.values.qdrant.collectionName
    );
  }

  public get qdrantConnectionFailurePauseMs(): number {
    return this.settingsConfig.values.service.qdrantConnectionFailurePauseMinutes * 60_000;
  }

  public get enableQdrantIngestion(): boolean {
    return this.settingsConfig.values.service.enableQdrantIngestion;
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

  public get mongoConfig(): MongoConfig {
    const host = process.env.MONGO_HOST?.trim() || this.secretsConfig.values.mongo.host;
    const port = this.readPositiveInt('MONGO_PORT', this.secretsConfig.values.mongo.port);
    const database =
      process.env.MONGO_DATABASE?.trim() || this.secretsConfig.values.mongo.database;
    const username =
      process.env.MONGO_USERNAME?.trim() || this.secretsConfig.values.mongo.username;
    const password =
      process.env.MONGO_PASSWORD?.trim() || this.secretsConfig.values.mongo.password;

    return {
      host,
      port,
      database,
      username,
      password
    };
  }

  public get processedConversationsOutputPath(): string {
    return resolve(
      process.cwd(),
      'output',
      this.settingsConfig.values.service.processedConversationsFolderName
    );
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
}
