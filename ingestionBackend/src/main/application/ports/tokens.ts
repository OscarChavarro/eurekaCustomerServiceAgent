export const TOKENS = {
  IngestionRuntimeConfigPort: Symbol('IngestionRuntimeConfigPort'),
  ConversationCsvSourcePort: Symbol('ConversationCsvSourcePort'),
  EmbeddingPort: Symbol('EmbeddingPort'),
  VectorStorePort: Symbol('VectorStorePort'),
  ProcessedConversationStageStorePort: Symbol('ProcessedConversationStageStorePort')
} as const;
