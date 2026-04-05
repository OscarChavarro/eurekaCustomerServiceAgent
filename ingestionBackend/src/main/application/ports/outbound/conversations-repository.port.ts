export type RawConversationDirection = 'customer_to_agent' | 'agent_to_customer' | 'whatsapAuto';

export type RawConversationStageMessage = {
  externalId: string;
  sentAt: string | null;
  sender: string | null;
  text: string;
  sourceFile: string;
  rowNumber: number;
  direction: RawConversationDirection;
  normalizedFields: Record<string, unknown>;
};

export type CleanedConversationStageMessage = {
  externalId: string;
  direction: RawConversationDirection;
  text: string;
};

export type StructuredConversationStageMessage = {
  turnId: string;
  question: string;
  answer: string;
  messageIds: string[];
};

export type ChunkedConversationStageMessage = {
  chunkId: string;
  chunkMessage: string;
  messageIds: string[];
};

export type ConversationMetadata = {
  createdAt: Date;
  source: string;
  lastMessageDate: string | null;
  lastMessageText: string | null;
};

export interface ConversationsRepositoryPort {
  upsertRawMessages(
    conversationId: string,
    rawMessages: RawConversationStageMessage[],
    metadata: ConversationMetadata
  ): Promise<void>;
  upsertCleanedMessages(
    conversationId: string,
    cleanedMessages: CleanedConversationStageMessage[]
  ): Promise<void>;
  upsertStructuredMessages(
    conversationId: string,
    structuredMessages: StructuredConversationStageMessage[]
  ): Promise<void>;
  upsertChunkedMessages(
    conversationId: string,
    chunkedMessages: ChunkedConversationStageMessage[]
  ): Promise<void>;
}
