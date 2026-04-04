import type { GetConversationMessagesResult } from '../../use-cases/get-conversation-messages/get-conversation-messages.result';

export interface GetConversationMessagesUseCasePort {
  execute(conversationId: string): Promise<GetConversationMessagesResult>;
}
