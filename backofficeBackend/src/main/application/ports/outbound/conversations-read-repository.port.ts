import type { ConversationSummaryResult } from '../../use-cases/get-conversation-ids/get-conversation-ids.result';

export interface ConversationsReadRepositoryPort {
  getConversationIds(): Promise<ConversationSummaryResult[]>;
  getConversationById(conversationId: string): Promise<Record<string, unknown> | null>;
}
