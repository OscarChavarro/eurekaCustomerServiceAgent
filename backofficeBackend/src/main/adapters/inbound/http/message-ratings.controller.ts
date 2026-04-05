import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { GetMessageRatingsUseCase } from '../../../application/use-cases/get-message-ratings/get-message-ratings.use-case';
import type { GetMessageRatingsResult } from '../../../application/use-cases/get-message-ratings/get-message-ratings.types';

@Controller('message-ratings')
export class MessageRatingsController {
  constructor(private readonly getMessageRatingsUseCase: GetMessageRatingsUseCase) {}

  @Get()
  public async getMessageRatings(
    @Query('conversationId') conversationId: string | undefined
  ): Promise<GetMessageRatingsResult> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw new BadRequestException('Query parameter "conversationId" is required.');
    }

    return this.getMessageRatingsUseCase.execute(conversationId);
  }
}
