import { Inject, Injectable } from '@nestjs/common';
import type { NearestEmbeddingsConfigPort } from '../../../ports/outbound/nearest-embeddings/nearest-embeddings-config.port';
import { TOKENS } from '../../../ports/tokens';
import type { FindNearestEmbeddingsCommand } from './find-nearest-embeddings.command';

interface BgeEmbeddingResponse {
  vector: number[];
}

interface QdrantSearchPoint {
  payload?: unknown;
  vector?: unknown;
  score?: unknown;
}

interface QdrantSearchResponse {
  result?: QdrantSearchPoint[];
}

export type NearestEmbeddingsPoint = {
  payload: Record<string, unknown>;
  vector: number[];
  score: number | null;
};

export type FindNearestEmbeddingsResult = {
  points: NearestEmbeddingsPoint[];
};

@Injectable()
export class FindNearestEmbeddingsUseCase {
  private static readonly EXPECTED_BGE_VECTOR_DIMENSIONS = 1024;
  private static readonly RETURNED_VECTOR_DIMENSIONS = 5;

  constructor(
    @Inject(TOKENS.NearestEmbeddingsConfigPort)
    private readonly nearestEmbeddingsConfigPort: NearestEmbeddingsConfigPort
  ) {}

  public async execute(command: FindNearestEmbeddingsCommand): Promise<FindNearestEmbeddingsResult> {
    const embedding = await this.generatePromptEmbedding(command.block);
    const nearestPoints = await this.searchNearestPoints(embedding, command.numberOfPoints);

    return {
      points: nearestPoints.map((point) => ({
        payload: this.normalizePayload(point.payload),
        vector: this.extractVector(point.vector).slice(0, FindNearestEmbeddingsUseCase.RETURNED_VECTOR_DIMENSIONS),
        score: this.normalizeScore(point.score)
      }))
    };
  }

  private async generatePromptEmbedding(prompt: string): Promise<number[]> {
    const embeddingConfig = this.nearestEmbeddingsConfigPort.getEmbeddingProviderConfig();
    const provider = embeddingConfig.provider.trim().toLowerCase();

    if (provider !== 'bge') {
      throw new Error(`Unsupported embedding provider "${embeddingConfig.provider}".`);
    }

    const endpoint = `http://${embeddingConfig.host}:${embeddingConfig.port}/embed`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: prompt })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as BgeEmbeddingResponse;
    if (!Array.isArray(payload.vector) || payload.vector.some((value) => typeof value !== 'number')) {
      throw new Error('Embedding response is invalid. Expected { "vector": number[] }.');
    }

    if (payload.vector.length !== FindNearestEmbeddingsUseCase.EXPECTED_BGE_VECTOR_DIMENSIONS) {
      throw new Error(
        `Embedding dimensions mismatch. Expected ${FindNearestEmbeddingsUseCase.EXPECTED_BGE_VECTOR_DIMENSIONS}, received ${payload.vector.length}.`
      );
    }

    return payload.vector;
  }

  private async searchNearestPoints(vector: number[], numberOfPoints: number): Promise<QdrantSearchPoint[]> {
    const qdrantConfig = this.nearestEmbeddingsConfigPort.getQdrantSearchConfig();
    const searchUrl = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points/search`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (qdrantConfig.apiKey) {
      headers['api-key'] = qdrantConfig.apiKey;
    }

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        vector,
        limit: numberOfPoints,
        with_payload: true,
        with_vector: true
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Qdrant search request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as QdrantSearchResponse;
    return Array.isArray(payload.result) ? payload.result : [];
  }

  private normalizePayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return payload as Record<string, unknown>;
  }

  private extractVector(rawVector: unknown): number[] {
    if (Array.isArray(rawVector) && rawVector.every((value) => typeof value === 'number')) {
      return rawVector;
    }

    if (!rawVector || typeof rawVector !== 'object' || Array.isArray(rawVector)) {
      return [];
    }

    const vectorsByName = rawVector as Record<string, unknown>;
    for (const value of Object.values(vectorsByName)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
        return value;
      }
    }

    return [];
  }

  private normalizeScore(rawScore: unknown): number | null {
    return typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? rawScore
      : null;
  }
}
