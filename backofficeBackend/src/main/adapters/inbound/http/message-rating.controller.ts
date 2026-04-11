import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type {
  RevisionMutationValue,
  RevisionStage
} from '../../../application/ports/outbound/message-rating-repository.port';
import { RateMessageUseCase } from '../../../application/use-cases/rate-message/rate-message.use-case';
import type { RateMessageResult } from '../../../application/use-cases/rate-message/rate-message.types';

type RateMessageRequest = {
  conversationId?: string;
  stage?: RevisionStage;
  stageId?: string;
  rating?: RevisionMutationValue;
};

@Controller('message-rating')
export class MessageRatingController {
  constructor(private readonly rateMessageUseCase: RateMessageUseCase) {}

  @Post()
  public async rateMessage(@Body() request: RateMessageRequest): Promise<RateMessageResult> {
    if (!request.conversationId || request.conversationId.trim().length === 0) {
      throw new BadRequestException('Field "conversationId" is required.');
    }

    if (!request.stage || !this.isValidStage(request.stage)) {
      throw new BadRequestException('Field "stage" must be one of: raw, clean, normalize, structure, chunk.');
    }

    if (!request.stageId || request.stageId.trim().length === 0) {
      throw new BadRequestException('Field "stageId" is required.');
    }

    if (!request.rating || !this.isValidMutationValue(request.rating)) {
      throw new BadRequestException(
        'Field "rating" must be one of: warning, good, bad, cleared.'
      );
    }

    if (!this.isRatingAllowedForStage(request.stage, request.rating)) {
      throw new BadRequestException(
        `Rating "${request.rating}" is not allowed for stage "${request.stage}".`
      );
    }

    return this.rateMessageUseCase.execute({
      conversationId: request.conversationId,
      stage: request.stage,
      stageId: request.stageId,
      rating: request.rating
    });
  }

  private isValidStage(stage: string): stage is RevisionStage {
    return (
      stage === 'raw' ||
      stage === 'clean' ||
      stage === 'normalize' ||
      stage === 'structure' ||
      stage === 'chunk'
    );
  }

  private isValidMutationValue(value: string): value is RevisionMutationValue {
    return value === 'warning' || value === 'good' || value === 'bad' || value === 'cleared';
  }

  private isRatingAllowedForStage(stage: RevisionStage, rating: RevisionMutationValue): boolean {
    if (rating === 'cleared') {
      return true;
    }

    if (stage === 'raw') {
      return rating === 'warning';
    }

    return rating === 'good' || rating === 'bad';
  }
}
