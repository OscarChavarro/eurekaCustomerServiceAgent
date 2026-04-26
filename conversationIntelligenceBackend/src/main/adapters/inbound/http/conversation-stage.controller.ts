import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type {
  GetConversationStageDebugResult,
  GetConversationStageResult
} from '../../../application/use-cases/get-conversation-stage/get-conversation-stage.types';
import { GetConversationStageUseCase } from '../../../application/use-cases/get-conversation-stage/get-conversation-stage.use-case';

@Controller('conversationStage')
export class ConversationStageController {
  constructor(private readonly getConversationStageUseCase: GetConversationStageUseCase) {}

  @Get()
  public async getConversationStage(
    @Query('conversationId') conversationId: string | undefined,
    @Query('forceRefresh') forceRefreshRaw: string | undefined
  ): Promise<GetConversationStageResult> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw new BadRequestException('Query parameter "conversationId" is required.');
    }

    const forceRefresh = this.parseForceRefresh(forceRefreshRaw, false);

    return this.getConversationStageUseCase.execute({
      conversationId: conversationId.trim(),
      forceRefresh
    });
  }

  @Get('debug')
  public async getConversationStageDebug(
    @Query('conversationId') conversationId: string | undefined,
    @Query('forceRefresh') forceRefreshRaw: string | undefined
  ): Promise<GetConversationStageDebugResult> {
    if (!conversationId || conversationId.trim().length === 0) {
      throw new BadRequestException('Query parameter "conversationId" is required.');
    }

    const forceRefresh = this.parseForceRefresh(forceRefreshRaw, true);

    return this.getConversationStageUseCase.executeDebug({
      conversationId: conversationId.trim(),
      forceRefresh
    });
  }

  private parseForceRefresh(value: string | undefined, defaultValue: boolean): boolean {
    if (!value || value.trim().length === 0) {
      return defaultValue;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === '0') {
      return false;
    }

    throw new BadRequestException(
      'Query parameter "forceRefresh" must be a boolean value (true|false|1|0).'
    );
  }
}
