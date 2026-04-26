import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

type QdrantCollectionsResponse = {
  result?: {
    collections?: Array<{
      name?: string;
    }>;
  };
};

@Injectable()
export class QdrantConnectivityStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'QdrantConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return `Qdrant connection check succeeded for collection "${this.serviceConfig.qdrantConfig.collectionName}".`;
  }

  public async validate(): Promise<void> {
    const qdrantConfig = this.serviceConfig.qdrantConfig;
    const collectionsUrl = `${qdrantConfig.url}/collections`;

    let response: Response;
    try {
      response = await fetch(collectionsUrl, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error(`Dependency Qdrant failed at ${collectionsUrl}: ${String(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `Dependency Qdrant failed at ${collectionsUrl}: returned ${response.status} ${response.statusText}.`
      );
    }

    const payload = (await response.json()) as QdrantCollectionsResponse;
    const collections = Array.isArray(payload.result?.collections) ? payload.result.collections : [];
    const targetCollection = qdrantConfig.collectionName.trim();
    const collectionFound = collections.some((collection) => collection.name === targetCollection);

    if (!collectionFound) {
      throw new Error(
        `Dependency Qdrant failed: collection "${targetCollection}" was not found.`
      );
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = this.serviceConfig.qdrantConfig.apiKey?.trim();

    if (apiKey) {
      headers['api-key'] = apiKey;
    }

    return headers;
  }
}
