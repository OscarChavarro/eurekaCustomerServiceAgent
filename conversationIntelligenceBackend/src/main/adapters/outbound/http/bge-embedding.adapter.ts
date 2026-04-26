import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import type { EmbeddingPort } from '../../../ports/outbound/embedding.port';

type BgeEmbeddingResponse = {
  vector?: number[];
};

@Injectable()
export class BgeEmbeddingAdapter implements EmbeddingPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async embedText(text: string): Promise<number[]> {
    const embeddingConfig = this.serviceConfig.embeddingConfig;
    const endpoint = `http://${embeddingConfig.host}:${embeddingConfig.port}/embed`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw new Error(
        `Embedding provider failed at ${endpoint}: returned ${response.status} ${response.statusText}.`
      );
    }

    const payload = (await response.json()) as BgeEmbeddingResponse;
    if (!Array.isArray(payload.vector) || payload.vector.some((value) => typeof value !== 'number')) {
      throw new Error('Embedding provider returned invalid payload. Expected { "vector": number[] }.');
    }

    return payload.vector;
  }
}
