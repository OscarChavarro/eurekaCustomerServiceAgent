export const TOKENS = {
  ConversationsReadRepositoryPort: Symbol('ConversationsReadRepositoryPort'),
  PhonePrefixCatalogPort: Symbol('PhonePrefixCatalogPort'),
  MessageRatingRepositoryPort: Symbol('MessageRatingRepositoryPort'),
  LlmChatCompletionsPort: Symbol('LlmChatCompletionsPort'),
  ConversationDeletionRepositoryPort: Symbol('ConversationDeletionRepositoryPort'),
  ConversationCsvArchivePort: Symbol('ConversationCsvArchivePort')
} as const;
