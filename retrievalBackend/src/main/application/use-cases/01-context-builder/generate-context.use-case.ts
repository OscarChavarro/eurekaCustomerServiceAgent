import { Inject, Injectable } from '@nestjs/common';
import type {
  ContextGenerator,
  GenerateContextInput
} from '../../ports/outbound/context/context-generator.port';
import { TOKENS } from '../../ports/tokens';

@Injectable()
export class GenerateContextUseCase {
  constructor(
    @Inject(TOKENS.ContextGenerator)
    private readonly contextGenerator: ContextGenerator
  ) {}

  public async execute(input: GenerateContextInput): Promise<string> {
    return this.contextGenerator.generateContext(input);
  }
}
