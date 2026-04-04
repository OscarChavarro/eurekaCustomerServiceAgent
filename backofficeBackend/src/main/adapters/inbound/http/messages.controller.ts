import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import type { GetConversationMessagesResult } from '../../../application/use-cases/get-conversation-messages/get-conversation-messages.result';
import { GetConversationMessagesUseCase } from '../../../application/use-cases/get-conversation-messages/get-conversation-messages.use-case';

@Controller('messages')
export class MessagesController {
  constructor(private readonly getConversationMessagesUseCase: GetConversationMessagesUseCase) {}

  @Get()
  public async getMessages(@Query('id') conversationId: string | undefined): Promise<GetConversationMessagesResult> {
    if (!conversationId) {
      throw new BadRequestException('Query parameter "id" is required.');
    }

    const conversation = await this.getConversationMessagesUseCase.execute(conversationId);

    if (!conversation) {
      throw new NotFoundException(`Conversation not found for id: ${conversationId}`);
    }

    return conversation;
  }
}
