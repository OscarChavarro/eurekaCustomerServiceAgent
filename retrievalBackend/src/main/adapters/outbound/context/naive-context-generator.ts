import { Injectable, Logger } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../../application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class NaiveContextGenerator implements ContextGenerator {
  private readonly logger = new Logger(NaiveContextGenerator.name);

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateContext(messages: ContextGeneratorMessage[]): Promise<string> {
    void messages;
    const context = this.serviceConfig.contextGeneratorConfig.naive.contextMessage.join(' ').trim();
    this.logger.log(`Generated context (naive):\n${context}`);
    return context;
  }
}
