import { Injectable } from '@nestjs/common';
import type {
  EmbeddingProviderConfig,
  NearestEmbeddingsConfigPort,
  QdrantSearchConfig
} from '../../../application/ports/outbound/nearest-embeddings/nearest-embeddings-config.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class NearestEmbeddingsConfigAdapter implements NearestEmbeddingsConfigPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getEmbeddingProviderConfig(): EmbeddingProviderConfig {
    const embeddingConfig = this.serviceConfig.embeddingConfig;

    return {
      provider: embeddingConfig.provider,
      host: embeddingConfig.host,
      port: embeddingConfig.port
    };
  }

  public getQdrantSearchConfig(): QdrantSearchConfig {
    const qdrantConfig = this.serviceConfig.qdrantConfig;

    return {
      url: qdrantConfig.url,
      apiKey: qdrantConfig.apiKey,
      collectionName: qdrantConfig.collectionName
    };
  }
}
