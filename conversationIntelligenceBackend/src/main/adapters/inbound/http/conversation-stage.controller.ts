import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { GetConversationStageResult } from '../../../application/use-cases/get-conversation-stage/get-conversation-stage.types';
import { GetConversationStageUseCase } from '../../../application/use-cases/get-conversation-stage/get-conversation-stage.use-case';

@Controller('conversationStage')
export class ConversationStageController {
  constructor(private readonly getConversationStageUseCase: GetConversationStageUseCase) {}

  @Get()
  public async getConversationStage(
    @Query('conversationId') conversationId: string | undefined
  ): Promise<GetConversationStageResult> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw new BadRequestException('Query parameter "conversationId" is required.');
    }

    return this.getConversationStageUseCase.execute({
      conversationId: conversationId.trim()
    });
  }
}
