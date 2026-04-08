import { BadGatewayException, BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { FindNearestEmbeddingsCommand } from '../../../application/use-cases/support/diagnostics/find-nearest-embeddings.command';
import { FindNearestEmbeddingsUseCase } from '../../../application/use-cases/support/diagnostics/find-nearest-embeddings.use-case';

@Controller()
export class NearestEmbeddingsController {
  constructor(private readonly findNearestEmbeddingsUseCase: FindNearestEmbeddingsUseCase) {}

  @Post('nearestEmbeddings')
  public async nearestEmbeddings(@Body() body: unknown): Promise<unknown> {
    const command = this.parseAndValidatePayload(body);

    try {
      return await this.findNearestEmbeddingsUseCase.execute(command);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException({
        message
      });
    }
  }

  private parseAndValidatePayload(body: unknown): FindNearestEmbeddingsCommand {
    if (!this.isRecord(body)) {
      throw new BadRequestException('Payload must be a JSON object.');
    }

    const allowedKeys = new Set(['block', 'numberOfPoints']);
    const forbiddenKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
    if (forbiddenKeys.length > 0) {
      throw new BadRequestException(`Unsupported fields: ${forbiddenKeys.join(', ')}.`);
    }

    const block = body.block;
    if (typeof block !== 'string' || block.trim().length === 0) {
      throw new BadRequestException('"block" must be a non-empty string.');
    }

    const numberOfPoints = body.numberOfPoints;
    if (
      typeof numberOfPoints !== 'number' ||
      !Number.isInteger(numberOfPoints) ||
      numberOfPoints <= 0
    ) {
      throw new BadRequestException('"numberOfPoints" must be a positive integer.');
    }

    return {
      block: block.trim(),
      numberOfPoints
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
