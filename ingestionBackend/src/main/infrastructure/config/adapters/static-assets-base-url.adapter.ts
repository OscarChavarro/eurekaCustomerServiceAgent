import { Injectable } from '@nestjs/common';
import type { StaticAssetsBaseUrlPort } from '../../../application/ports/outbound/static-assets-base-url.port';
import { ServiceConfig } from '../service.config';

@Injectable()
export class StaticAssetsBaseUrlAdapter implements StaticAssetsBaseUrlPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getBaseUrl(): string {
    return this.serviceConfig.staticAssetsConfig.baseUrl;
  }
}

