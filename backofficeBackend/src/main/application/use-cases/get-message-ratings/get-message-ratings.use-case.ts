import { Inject, Injectable } from '@nestjs/common';
import type { MessageRatingRepositoryPort } from '../../ports/outbound/message-rating-repository.port';
import { TOKENS } from '../../ports/tokens';
import type { GetMessageRatingsResult } from './get-message-ratings.types';

@Injectable()
export class GetMessageRatingsUseCase {
  constructor(
    @Inject(TOKENS.MessageRatingRepositoryPort)
    private readonly messageRatingRepositoryPort: MessageRatingRepositoryPort
  ) {}

  public async execute(conversationId: string): Promise<GetMessageRatingsResult> {
    const revisions = await this.messageRatingRepositoryPort.findByConversationId(conversationId);

    const result: GetMessageRatingsResult = {
      conversationId,
      ratings: {
        raw: {},
        clean: {},
        normalize: {},
        structure: {},
        chunk: {}
      }
    };

    revisions.forEach((revision) => {
      result.ratings[revision.stage][revision.stageId] = revision.rating;
    });

    return result;
  }
}
