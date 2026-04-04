export interface ProcessedConversationStageStorePort {
  saveConversationStages(
    conversationId: string,
    stages: unknown
  ): Promise<void>;
}
