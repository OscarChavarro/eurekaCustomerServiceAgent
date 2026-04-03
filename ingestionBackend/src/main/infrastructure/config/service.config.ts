import { Injectable } from '@nestjs/common';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

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

  public get embeddingDimension(): number {
    return this.secretsConfig.values.embedding.dimension;
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
