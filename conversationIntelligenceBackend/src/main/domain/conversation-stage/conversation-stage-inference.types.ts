import type { CustomerStage } from './conversation-stage.types';

export type ConversationMessageEvidence = {
  messageId: string;
  text: string;
  timestamp: string;
  score?: number;
};

export type SemanticProbeMatch = {
  probeName: string;
  matches: ConversationMessageEvidence[];
};

export type LlmStageClassificationResult = {
  currentStage: CustomerStage;
  summary: string;
  detectedSignals: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  noHint: boolean;
};
