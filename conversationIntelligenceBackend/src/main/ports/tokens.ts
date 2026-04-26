export const TOKENS = {
  ConversationStageRepositoryPort: Symbol('ConversationStageRepositoryPort'),
  ConversationStageInferenceConfigPort: Symbol('ConversationStageInferenceConfigPort'),
  ContactsPort: Symbol('ContactsPort'),
  EmbeddingPort: Symbol('EmbeddingPort'),
  QdrantConversationSearchPort: Symbol('QdrantConversationSearchPort'),
  LlmConversationStageClassifierPort: Symbol('LlmConversationStageClassifierPort')
} as const;
