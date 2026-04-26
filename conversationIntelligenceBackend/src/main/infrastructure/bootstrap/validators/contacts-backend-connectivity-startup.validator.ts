import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class ContactsBackendConnectivityStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'ContactsBackendConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'contactsBackend health check succeeded.';
  }

  public async validate(): Promise<void> {
    const url = `${this.serviceConfig.contactsBackendConfig.baseUrl}/health`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new Error(`Dependency contactsBackend failed at ${url}: ${String(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `Dependency contactsBackend failed at ${url}: health check returned ${response.status} ${response.statusText}.`
      );
    }
  }
}
