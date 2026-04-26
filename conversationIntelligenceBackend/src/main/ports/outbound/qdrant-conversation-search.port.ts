import type {
  ConversationMessageEvidence,
  SemanticProbeMatch
} from '../../domain/conversation-stage/conversation-stage-inference.types';

export interface QdrantConversationSearchPort {
  listConversationMessages(conversationId: string, limit: number): Promise<ConversationMessageEvidence[]>;
  searchSemanticSignals(
    conversationId: string,
    probeVectors: Array<{ probeName: string; vector: number[] }>,
    topK: number
  ): Promise<SemanticProbeMatch[]>;
}
