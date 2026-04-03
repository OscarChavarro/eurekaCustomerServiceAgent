import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { EmbeddingGeneratorPort } from '../../../application/ports/outbound/embedding-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class LocalHashEmbeddingGeneratorAdapter implements EmbeddingGeneratorPort {
  private readonly dimensions: number;

  constructor(private readonly serviceConfig: ServiceConfig) {
    this.dimensions = this.serviceConfig.embeddingDimension;
  }

  public getDimensions(): number {
    return this.dimensions;
  }

  public async generateEmbeddings(inputs: string[]): Promise<number[][]> {
    return inputs.map((input) => this.embed(input));
  }

  private embed(input: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);

    for (let index = 0; index < this.dimensions; index += 1) {
      const digest = createHash('sha256').update(`${index}:${input}`).digest();
      const unsigned = digest.readUInt32BE(0);
      vector[index] = unsigned / 0xffffffff;
    }

    return this.normalize(vector);
  }

  private normalize(values: number[]): number[] {
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

    if (norm === 0) {
      return values;
    }

    return values.map((value) => value / norm);
  }
}
