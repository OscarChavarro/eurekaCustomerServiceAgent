import type {
  ConversationMessageEvidence,
  LlmStageClassificationResult,
  SemanticProbeMatch
} from '../../../domain/conversation-stage/conversation-stage-inference.types';
import type { ConversationStage } from '../../../domain/conversation-stage/conversation-stage.types';

export type GetConversationStageCommand = {
  conversationId: string;
  forceRefresh: boolean;
};

export type GetConversationStageResult = ConversationStage;

export type GetConversationStageDebugResult = {
  stage: ConversationStage;
  debug: {
    refreshed: boolean;
    cacheExpired: boolean;
    messagesCount: number;
    messagesSample: ConversationMessageEvidence[];
    deterministicSignals: string[];
    semanticMatches: SemanticProbeMatch[];
    llmClassification: LlmStageClassificationResult | null;
  };
};
