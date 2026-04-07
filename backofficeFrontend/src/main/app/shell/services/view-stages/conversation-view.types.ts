export type ChatMessageDirection = 'incoming' | 'outgoing' | 'system';
export type MessageReviewStage = 'raw' | 'clean' | 'structure' | 'chunk';

export type ChatMessage = {
  id: string;
  direction: ChatMessageDirection;
  text: string;
  sentAt: string;
  isAiGenerated?: boolean;
  usedContext?: string[];
  stageLabel?: string;
  backgroundColor?: string;
  status?: 'sent' | 'delivered' | 'read';
  rawText?: string;
  showRawStrikethrough?: boolean;
  imageUrl?: string;
  reviewStage?: MessageReviewStage;
  reviewStageId?: string;
};

export type ConversationViewMode = 'raw' | 'clean' | 'structure' | 'chunk' | 'embed';
