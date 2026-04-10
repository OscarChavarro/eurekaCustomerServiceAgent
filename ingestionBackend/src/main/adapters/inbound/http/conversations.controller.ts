import { Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import type { ConversationsDeleteAllResult } from '../../../application/use-cases/conversations-delete-all/conversations-delete-all.result';
import { ConversationsDeleteAllUseCase } from '../../../application/use-cases/conversations-delete-all/conversations-delete-all.use-case';

@Controller()
export class ConversationsController {
  constructor(
    private readonly conversationsDeleteAllUseCase: ConversationsDeleteAllUseCase
  ) {}

  @Delete('conversations')
  @HttpCode(HttpStatus.OK)
  public async deleteAllConversations(): Promise<ConversationsDeleteAllResult> {
    return this.conversationsDeleteAllUseCase.execute();
  }
}

