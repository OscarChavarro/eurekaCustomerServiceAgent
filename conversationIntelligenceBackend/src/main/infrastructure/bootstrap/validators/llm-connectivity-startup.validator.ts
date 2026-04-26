import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class LlmConnectivityStartupValidator implements StartupValidator {
  private successfulProbeUrl: string | null = null;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'LlmConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    if (this.successfulProbeUrl) {
      return `LLM connectivity check succeeded at ${this.successfulProbeUrl}.`;
    }

    return 'LLM connectivity check succeeded.';
  }

  public async validate(): Promise<void> {
    const configuredUrl = this.serviceConfig.llmConfig.healthUrl;
    const fallbackOllamaTagsUrl = `${this.serviceConfig.llmConfig.baseUrl}/api/tags`;
    const urlsToProbe = [configuredUrl];

    if (fallbackOllamaTagsUrl !== configuredUrl) {
      urlsToProbe.push(fallbackOllamaTagsUrl);
    }

    const probeFailures: string[] = [];

    for (const url of urlsToProbe) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(10_000)
        });
      } catch (error) {
        probeFailures.push(`${url} -> ${String(error)}`);
        continue;
      }

      if (!response.ok) {
        probeFailures.push(
          `${url} -> returned ${response.status} ${response.statusText}`
        );
        continue;
      }

      this.successfulProbeUrl = url;
      return;
    }

    throw new Error(`Dependency LLM failed. Probes: ${probeFailures.join(' | ')}.`);
  }
}
