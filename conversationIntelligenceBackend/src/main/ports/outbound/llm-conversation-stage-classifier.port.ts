import type {
  ConversationMessageEvidence,
  LlmStageClassificationResult,
  SemanticProbeMatch
} from '../../domain/conversation-stage/conversation-stage-inference.types';

export type LlmConversationClassificationCommand = {
  conversationId: string;
  messages: ConversationMessageEvidence[];
  semanticMatches: SemanticProbeMatch[];
  deterministicSignals: string[];
  allowedStages: string[];
};

export interface LlmConversationStageClassifierPort {
  classify(command: LlmConversationClassificationCommand): Promise<LlmStageClassificationResult>;
}
