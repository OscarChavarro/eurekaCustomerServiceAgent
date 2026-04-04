import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

interface BgeEmbeddingResponse {
  vector: number[];
}

@Injectable()
export class BgeConnectivityStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'BgeConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'BGE connection check succeeded.';
  }

  public async validate(): Promise<void> {
    const embeddingConfig = this.serviceConfig.embeddingConfig;
    const provider = embeddingConfig.provider.trim().toLowerCase();

    if (provider !== 'bge') {
      throw new Error(`Unsupported embedding provider "${embeddingConfig.provider}".`);
    }

    const endpoint = `http://${embeddingConfig.host}:${embeddingConfig.port}/embed`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'startup connectivity check'
        }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error(`Cannot connect to BGE at ${endpoint}. ${String(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `BGE connectivity check failed with status ${response.status} ${response.statusText}.`
      );
    }

    const payload = (await response.json()) as BgeEmbeddingResponse;
    if (!Array.isArray(payload.vector) || payload.vector.some((value) => typeof value !== 'number')) {
      throw new Error('BGE response is invalid. Expected { "vector": number[] }.');
    }
  }
}
