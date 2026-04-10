export const TOKENS = {
  ConversationCsvSourcePort: Symbol('ConversationCsvSourcePort'),
  ContactsDirectoryPort: Symbol('ContactsDirectoryPort'),
  EmbeddingPort: Symbol('EmbeddingPort'),
  VectorStorePort: Symbol('VectorStorePort'),
  ProcessedConversationStageStorePort: Symbol('ProcessedConversationStageStorePort'),
  ConversationsRepositoryPort: Symbol('ConversationsRepositoryPort'),
  EmbeddingsRepositoryPort: Symbol('EmbeddingsRepositoryPort'),
  AudioTranscribeWorkerPoolPort: Symbol('AudioTranscribeWorkerPoolPort'),
  AudioWaveformBarsPort: Symbol('AudioWaveformBarsPort')
} as const;
