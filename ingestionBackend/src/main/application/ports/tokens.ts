export const TOKENS = {
  IngestionRuntimeConfigPort: Symbol('IngestionRuntimeConfigPort'),
  ConversationCsvSourcePort: Symbol('ConversationCsvSourcePort'),
  EmbeddingGeneratorPort: Symbol('EmbeddingGeneratorPort'),
  VectorStorePort: Symbol('VectorStorePort')
} as const;
