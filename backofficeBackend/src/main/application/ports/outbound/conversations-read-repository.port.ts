export interface ConversationsReadRepositoryPort {
  getConversationIds(): Promise<string[]>;
  getConversationById(conversationId: string): Promise<Record<string, unknown> | null>;
}
