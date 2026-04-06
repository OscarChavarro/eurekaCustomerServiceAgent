import { Injectable } from '@nestjs/common';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

export type CorsConfig = {
  allowedOrigins: string[];
  allowedNetworkCidr?: string;
};

export type LlmConfig = {
  host: string;
  port: number;
  endpoint: string;
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

export type ContextGeneratorImplementation = 'naive' | 'vector-search';

export type ContextGeneratorConfig = {
  implementation: ContextGeneratorImplementation;
  naive: {
    contextMessage: string[];
  };
  vectorSearch: {
    maxMatches: number;
  };
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

  public get corsConfig(): CorsConfig {
    return {
      allowedOrigins: this.secretsConfig.values.cors.allowedOrigins.map((origin) => origin.trim()),
      allowedNetworkCidr: this.secretsConfig.values.cors.allowedNetworkCidr?.trim()
    };
  }

  public get llmConfig(): LlmConfig {
    const host = process.env.LLM_HOST?.trim() || this.secretsConfig.values.llm.host;
    const port = this.readPositiveInt('LLM_PORT', this.secretsConfig.values.llm.port);
    const endpoint = this.normalizeEndpoint(
      process.env.LLM_ENDPOINT?.trim() || this.secretsConfig.values.llm.endpoint
    );

    return {
      host,
      port,
      endpoint
    };
  }

  public get embeddingConfig(): EmbeddingConfig {
    return {
      provider: this.secretsConfig.values.embedding.provider,
      host: this.secretsConfig.values.embedding.host,
      port: this.secretsConfig.values.embedding.port
    };
  }

  public get qdrantConfig(): QdrantConfig {
    return {
      url: this.normalizeUrl(this.secretsConfig.values.qdrant.url),
      apiKey: this.secretsConfig.values.qdrant.apiKey ?? undefined,
      collectionName: this.secretsConfig.values.qdrant.collectionName
    };
  }

  public get contextGeneratorConfig(): ContextGeneratorConfig {
    return {
      implementation: this.secretsConfig.values.contextGenerator.implementation,
      naive: {
        contextMessage: this.secretsConfig.values.contextGenerator.naive.contextMessage
      },
      vectorSearch: {
        maxMatches: this.secretsConfig.values.contextGenerator.vectorSearch.maxMatches
      }
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
}
