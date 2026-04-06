import { Injectable } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../../application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class NaiveContextGenerator implements ContextGenerator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateContext(messages: ContextGeneratorMessage[]): Promise<string> {
    void messages;
    return this.serviceConfig.contextGeneratorConfig.naive.contextMessage;
  }
}
