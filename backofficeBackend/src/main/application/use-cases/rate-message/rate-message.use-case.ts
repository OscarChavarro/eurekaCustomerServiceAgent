import { Inject, Injectable } from '@nestjs/common';
import type { RateMessageUseCasePort } from '../../ports/inbound/rate-message.use-case.port';
import type {
  MessageRatingRepositoryPort,
  RevisionMutationValue,
  RevisionStage
} from '../../ports/outbound/message-rating-repository.port';
import { TOKENS } from '../../ports/tokens';
import type { RateMessageCommand, RateMessageResult } from './rate-message.types';

@Injectable()
export class RateMessageUseCase implements RateMessageUseCasePort {
  constructor(
    @Inject(TOKENS.MessageRatingRepositoryPort)
    private readonly messageRatingRepositoryPort: MessageRatingRepositoryPort
  ) {}

  public async execute(command: RateMessageCommand): Promise<RateMessageResult> {
    if (!this.isRatingValidForStage(command.stage, command.rating)) {
      throw new Error(`Rating "${command.rating}" is not allowed for stage "${command.stage}".`);
    }

    const ratedAt = new Date();

    await this.messageRatingRepositoryPort.save({
      conversationId: command.conversationId,
      stage: command.stage,
      stageId: command.stageId,
      rating: command.rating,
      ratedAt
    });

    return {
      ok: true,
      conversationId: command.conversationId,
      stage: command.stage,
      stageId: command.stageId,
      rating: command.rating,
      ratedAt: ratedAt.toISOString()
    };
  }

  private isRatingValidForStage(stage: RevisionStage, rating: RevisionMutationValue): boolean {
    if (rating === 'cleared') {
      return true;
    }

    if (stage === 'raw') {
      return rating === 'warning';
    }

    return rating === 'good' || rating === 'bad';
  }
}
