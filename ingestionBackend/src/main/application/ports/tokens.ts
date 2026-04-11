export const TOKENS = {
  ConversationCsvSourcePort: Symbol('ConversationCsvSourcePort'),
  ContactsDirectoryPort: Symbol('ContactsDirectoryPort'),
  EmbeddingPort: Symbol('EmbeddingPort'),
  VectorStorePort: Symbol('VectorStorePort'),
  ProcessedConversationStageStorePort: Symbol('ProcessedConversationStageStorePort'),
  ConversationsRepositoryPort: Symbol('ConversationsRepositoryPort'),
  EmbeddingsRepositoryPort: Symbol('EmbeddingsRepositoryPort'),
  FailedAudioResourceLogPort: Symbol('FailedAudioResourceLogPort'),
  AudioTranscribeWorkerPoolPort: Symbol('AudioTranscribeWorkerPoolPort'),
  AudioWaveformBarsPort: Symbol('AudioWaveformBarsPort'),
  StaticAssetsBaseUrlPort: Symbol('StaticAssetsBaseUrlPort'),
  AssetResourceProbePort: Symbol('AssetResourceProbePort')
} as const;
