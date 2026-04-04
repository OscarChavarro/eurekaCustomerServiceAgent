import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class QdrantConnectivityStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'QdrantConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'Qdrant connection check succeeded.';
  }

  public async validate(): Promise<void> {
    const qdrantHealthUrl = `${this.serviceConfig.qdrantUrl.replace(/\/$/, '')}/collections`;
    const headers: HeadersInit = {};

    if (this.serviceConfig.qdrantApiKey) {
      headers['api-key'] = this.serviceConfig.qdrantApiKey;
    }

    let response: Response;
    try {
      response = await fetch(qdrantHealthUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5_000)
      });
    } catch (error) {
      throw new Error(`Cannot connect to Qdrant at ${qdrantHealthUrl}. ${String(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `Qdrant connectivity check failed with status ${response.status} ${response.statusText}.`
      );
    }
  }
}
