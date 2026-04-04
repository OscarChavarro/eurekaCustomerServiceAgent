import { Injectable } from '@nestjs/common';
import type { EmbeddingPort } from '../../../application/ports/outbound/embedding.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

interface BgeEmbeddingResponse {
  vector: number[];
}

@Injectable()
export class BgeEmbeddingAdapter implements EmbeddingPort {
  private static readonly EXPECTED_BGE_VECTOR_DIMENSIONS = 1024;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateEmbedding(text: string): Promise<number[]> {
    const endpoint = this.buildEmbeddingEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Embedding request failed: ${response.status} ${response.statusText}. ${body}`
      );
    }

    const payload = (await response.json()) as BgeEmbeddingResponse;

    if (!Array.isArray(payload.vector) || payload.vector.some((value) => typeof value !== 'number')) {
      throw new Error('Embedding response is invalid. Expected { "vector": number[] }.');
    }

    if (payload.vector.length !== BgeEmbeddingAdapter.EXPECTED_BGE_VECTOR_DIMENSIONS) {
      throw new Error(
        `Embedding dimensions mismatch. Expected ${BgeEmbeddingAdapter.EXPECTED_BGE_VECTOR_DIMENSIONS}, received ${payload.vector.length}.`
      );
    }

    return payload.vector;
  }

  private buildEmbeddingEndpoint(): string {
    const embeddingConfig = this.serviceConfig.embeddingConfig;
    const provider = embeddingConfig.provider.trim().toLowerCase();

    if (provider !== 'bge') {
      throw new Error(`Unsupported embedding provider "${embeddingConfig.provider}".`);
    }

    return `http://${embeddingConfig.host}:${embeddingConfig.port}/embed`;
  }
}
