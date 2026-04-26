export type ConversationStageInferenceConfig = {
  maxMessagesPerConversation: number;
  semanticProbeTopK: number;
  semanticMinScore: number;
  recomputeTtlMinutes: number;
  allowLlmFallbackOnLowSignal: boolean;
  salesCodePrefixes: string[];
};

export interface ConversationStageInferenceConfigPort {
  getConfig(): ConversationStageInferenceConfig;
}
