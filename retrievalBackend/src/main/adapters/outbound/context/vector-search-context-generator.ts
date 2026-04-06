import { Injectable } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../../application/ports/outbound/context/context-generator.port';

@Injectable()
export class VectorSearchContextGenerator implements ContextGenerator {
  public async generateContext(messages: ContextGeneratorMessage[]): Promise<string> {
    void messages;
    return 'TODO: Implement this!';
  }
}
