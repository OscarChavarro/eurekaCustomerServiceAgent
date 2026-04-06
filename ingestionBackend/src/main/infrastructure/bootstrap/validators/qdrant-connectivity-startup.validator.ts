import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

type QdrantCollectionResponse = {
  result?: {
    config?: {
      params?: {
        vectors?: unknown;
      };
    };
  };
};

@Injectable()
export class QdrantConnectivityStartupValidator implements StartupValidator {
  private static readonly EXPECTED_VECTOR_SIZE = 1024;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'QdrantConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return `Qdrant connection check succeeded. Collection "${this.serviceConfig.qdrantCollectionName}" ready with vector size ${QdrantConnectivityStartupValidator.EXPECTED_VECTOR_SIZE}.`;
  }

  public async validate(): Promise<void> {
    const baseUrl = this.serviceConfig.qdrantUrl.replace(/\/$/, '');
    const collectionName = this.serviceConfig.qdrantCollectionName;
    const collectionsUrl = `${baseUrl}/collections`;
    const collectionUrl = `${collectionsUrl}/${collectionName}`;

    const collectionsResponse = await this.request(collectionsUrl, { method: 'GET' });
    if (!collectionsResponse.ok) {
      throw new Error(
        `Qdrant connectivity check failed with status ${collectionsResponse.status} ${collectionsResponse.statusText}.`
      );
    }

    const collectionResponse = await this.request(collectionUrl, { method: 'GET' });
    if (collectionResponse.status === 404) {
      await this.createCollection(collectionUrl);
      return;
    }

    if (!collectionResponse.ok) {
      const body = await collectionResponse.text();
      throw new Error(
        `Qdrant collection check failed with status ${collectionResponse.status} ${collectionResponse.statusText}. ${body}`
      );
    }

    const collectionPayload = (await collectionResponse.json()) as QdrantCollectionResponse;
    const currentVectorSize = this.extractVectorSize(collectionPayload.result?.config?.params?.vectors);

    if (currentVectorSize === QdrantConnectivityStartupValidator.EXPECTED_VECTOR_SIZE) {
      return;
    }

    await this.deleteCollection(collectionUrl);
    await this.createCollection(collectionUrl);
  }

  private async createCollection(collectionUrl: string): Promise<void> {
    const createResponse = await this.request(collectionUrl, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: QdrantConnectivityStartupValidator.EXPECTED_VECTOR_SIZE,
          distance: 'Cosine'
        }
      })
    });

    if (createResponse.ok) {
      return;
    }

    const body = await createResponse.text();
    throw new Error(
      `Qdrant collection creation failed with status ${createResponse.status} ${createResponse.statusText}. ${body}`
    );
  }

  private async deleteCollection(collectionUrl: string): Promise<void> {
    const deleteResponse = await this.request(collectionUrl, { method: 'DELETE' });

    if (deleteResponse.ok || deleteResponse.status === 404) {
      return;
    }

    const body = await deleteResponse.text();
    throw new Error(
      `Qdrant collection deletion failed with status ${deleteResponse.status} ${deleteResponse.statusText}. ${body}`
    );
  }

  private extractVectorSize(vectors: unknown): number | null {
    if (!vectors || typeof vectors !== 'object') {
      return null;
    }

    if ('size' in vectors && typeof (vectors as { size?: unknown }).size === 'number') {
      return (vectors as { size: number }).size;
    }

    const namedVectors = Object.values(vectors as Record<string, unknown>);
    for (const namedVector of namedVectors) {
      if (
        namedVector &&
        typeof namedVector === 'object' &&
        'size' in namedVector &&
        typeof (namedVector as { size?: unknown }).size === 'number'
      ) {
        return (namedVector as { size: number }).size;
      }
    }

    return null;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);

    if (this.serviceConfig.qdrantApiKey) {
      headers.set('api-key', this.serviceConfig.qdrantApiKey);
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(5_000)
      });
    } catch (error) {
      throw new Error(`Cannot connect to Qdrant at ${url}. ${String(error)}`);
    }
  }
}
