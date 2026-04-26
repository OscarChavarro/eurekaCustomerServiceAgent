import { Injectable } from '@nestjs/common';
import { QdrantConnectionError } from '../../../application/errors/qdrant-connection.error';
import type { VectorPoint, VectorStorePort } from '../../../application/ports/outbound/vector-store.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class QdrantVectorStoreAdapter implements VectorStorePort {
  private static readonly VECTOR_SIZE = 1024;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async clearCollection(): Promise<void> {
    const url = `${this.baseUrl}/collections/${this.serviceConfig.qdrantCollectionName}`;
    const deleteResponse = await this.request(url, { method: 'DELETE' }, { allowNotFound: true });

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const body = await deleteResponse.text();
      throw new Error(
        `Qdrant collection cleanup failed: ${deleteResponse.status} ${deleteResponse.statusText}. ${body}`
      );
    }

    await this.request(url, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: QdrantVectorStoreAdapter.VECTOR_SIZE,
          distance: 'Cosine'
        }
      })
    });
  }

  public async deletePointsByConversationId(conversationId: string): Promise<void> {
    const trimmedConversationId = conversationId.trim();
    if (!trimmedConversationId) {
      return;
    }

    const url = `${this.baseUrl}/collections/${this.serviceConfig.qdrantCollectionName}/points/delete?wait=true`;

    await this.request(url, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'conversationId',
              match: { value: trimmedConversationId }
            }
          ]
        }
      })
    });
  }

  public async ensureCollection(dimension: number): Promise<void> {
    const url = `${this.baseUrl}/collections/${this.serviceConfig.qdrantCollectionName}`;
    const collectionResponse = await this.request(url, { method: 'GET' }, { allowNotFound: true });

    if (collectionResponse.status !== 404) {
      return;
    }

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

  private async request(
    url: string,
    init: RequestInit,
    options?: { allowNotFound?: boolean }
  ): Promise<Response> {
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
      if (options?.allowNotFound && response.status === 404) {
        return response;
      }

      const body = await response.text();
      throw new Error(`Qdrant request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    return response;
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
