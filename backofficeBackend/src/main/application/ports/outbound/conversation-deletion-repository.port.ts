export interface ConversationDeletionRepositoryPort {
  getConversationSourceFilePath(conversationId: string): Promise<string | null>;
  deleteEmbeddingsByConversationId(conversationId: string): Promise<number>;
  deleteConversationById(conversationId: string): Promise<boolean>;
}
