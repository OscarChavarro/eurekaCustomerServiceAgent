import { Inject, Injectable } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../ports/outbound/context/context-generator.port';
import { TOKENS } from '../../ports/tokens';

@Injectable()
export class GenerateContextUseCase {
  constructor(
    @Inject(TOKENS.ContextGenerator)
    private readonly contextGenerator: ContextGenerator
  ) {}

  public async execute(messages: ContextGeneratorMessage[]): Promise<string> {
    return this.contextGenerator.generateContext(messages);
  }
}
