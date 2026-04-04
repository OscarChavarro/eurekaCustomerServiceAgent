import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '../../ports/tokens';
import type { GetConversationMessagesUseCasePort } from '../../ports/inbound/get-conversation-messages.use-case.port';
import type { ConversationsReadRepositoryPort } from '../../ports/outbound/conversations-read-repository.port';
import type { GetConversationMessagesResult } from './get-conversation-messages.result';

@Injectable()
export class GetConversationMessagesUseCase implements GetConversationMessagesUseCasePort {
  constructor(
    @Inject(TOKENS.ConversationsReadRepositoryPort)
    private readonly conversationsReadRepository: ConversationsReadRepositoryPort
  ) {}

  public async execute(conversationId: string): Promise<GetConversationMessagesResult> {
    return this.conversationsReadRepository.getConversationById(conversationId);
  }
}
