import { Injectable } from '@nestjs/common';
import type { IngestionRuntimeConfigPort } from '../../../application/ports/config/ingestion-runtime-config.port';
import { ServiceConfig } from '../service.config';

@Injectable()
export class ServiceConfigIngestionRuntimeConfigAdapter implements IngestionRuntimeConfigPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public isQdrantIngestionEnabled(): boolean {
    return this.serviceConfig.enableQdrantIngestion;
  }
}
