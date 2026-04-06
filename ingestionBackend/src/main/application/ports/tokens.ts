export const TOKENS = {
  ConversationCsvSourcePort: Symbol('ConversationCsvSourcePort'),
  EmbeddingPort: Symbol('EmbeddingPort'),
  VectorStorePort: Symbol('VectorStorePort'),
  ProcessedConversationStageStorePort: Symbol('ProcessedConversationStageStorePort'),
  ConversationsRepositoryPort: Symbol('ConversationsRepositoryPort'),
  EmbeddingsRepositoryPort: Symbol('EmbeddingsRepositoryPort')
} as const;
