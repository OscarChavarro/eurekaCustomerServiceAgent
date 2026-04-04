import { Controller, Get } from '@nestjs/common';
import type { GetConversationIdsResult } from '../../../application/use-cases/get-conversation-ids/get-conversation-ids.result';
import { GetConversationIdsUseCase } from '../../../application/use-cases/get-conversation-ids/get-conversation-ids.use-case';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly getConversationIdsUseCase: GetConversationIdsUseCase) {}

  @Get()
  public async getConversationIds(): Promise<GetConversationIdsResult> {
    return this.getConversationIdsUseCase.execute();
  }
}
