import { Injectable, Logger } from '@nestjs/common';
import type {
  ContextGenerator,
  GenerateContextInput
} from '../../../application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class NaiveContextGenerator implements ContextGenerator {
  private readonly logger = new Logger(NaiveContextGenerator.name);

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateContext(input: GenerateContextInput): Promise<string> {
    void input;
    const context = this.serviceConfig.contextGeneratorConfig.naive.contextMessage;
    this.logger.log(`Generated context (naive):\n${context}`);
    return context;
  }
}
