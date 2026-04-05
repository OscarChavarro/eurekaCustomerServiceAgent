import { BadRequestException, Body, Controller, Delete } from '@nestjs/common';
import { DeleteConversationUseCase } from '../../../application/use-cases/delete-conversation/delete-conversation.use-case';
import type { DeleteConversationResult } from '../../../application/use-cases/delete-conversation/delete-conversation.types';

type DeleteConversationRequest = {
  conversationId?: string;
};

@Controller('conversation')
export class ConversationController {
  constructor(private readonly deleteConversationUseCase: DeleteConversationUseCase) {}

  @Delete()
  public async deleteConversation(
    @Body() request: DeleteConversationRequest
  ): Promise<DeleteConversationResult> {
    if (!request.conversationId || request.conversationId.trim().length === 0) {
      throw new BadRequestException('Field "conversationId" is required.');
    }

    return this.deleteConversationUseCase.execute({
      conversationId: request.conversationId.trim()
    });
  }
}
