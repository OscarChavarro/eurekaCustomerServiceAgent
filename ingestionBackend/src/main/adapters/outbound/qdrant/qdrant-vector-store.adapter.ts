import { Injectable } from '@nestjs/common';
import { QdrantConnectionError } from '../../../application/errors/qdrant-connection.error';
import type { VectorPoint, VectorStorePort } from '../../../application/ports/outbound/vector-store.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

interface QdrantResponse {
  status: string;
  time: number;
}

@Injectable()
export class QdrantVectorStoreAdapter implements VectorStorePort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async ensureCollection(dimension: number): Promise<void> {
    const url = `${this.baseUrl}/collections/${this.serviceConfig.qdrantCollectionName}`;

    await this.request(url, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: dimension,
          distance: 'Cosine'
        }
      })
    });
  }

  public async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }

    const url = `${this.baseUrl}/collections/${this.serviceConfig.qdrantCollectionName}/points?wait=true`;

    await this.request(url, {
      method: 'PUT',
      body: JSON.stringify({ points })
    });
  }

  private get baseUrl(): string {
    return this.serviceConfig.qdrantUrl.replace(/\/$/, '');
  }

  private async request(url: string, init: RequestInit): Promise<QdrantResponse> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (this.serviceConfig.qdrantApiKey) {
      headers['api-key'] = this.serviceConfig.qdrantApiKey;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      if (this.isConnectionRefused(error)) {
        throw new QdrantConnectionError();
      }

      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Qdrant request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as QdrantResponse;
    return payload;
  }

  private isConnectionRefused(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('cause' in error)) {
      return false;
    }

    const cause = (error as { cause?: unknown }).cause;

    if (!cause || typeof cause !== 'object') {
      return false;
    }

    if ('code' in cause && (cause as { code?: string }).code === 'ECONNREFUSED') {
      return true;
    }

    if (!('errors' in cause)) {
      return false;
    }

    const errors = (cause as { errors?: unknown }).errors;

    if (!Array.isArray(errors)) {
      return false;
    }

    return errors.some(
      (item) => !!item && typeof item === 'object' && (item as { code?: string }).code === 'ECONNREFUSED'
    );
  }
}
