export type RawConversationDirection = 'customer_to_agent' | 'agent_to_customer' | 'whatsapAuto';

export type RawConversationStageMessage = {
  externalId: string;
  sentAt: string | null;
  sender: string | null;
  text: string;
  rowNumber: number;
  direction: RawConversationDirection;
  normalizedFields: Record<string, unknown>;
  audioDetails?: RawConversationAudioDetails;
};

export type RawConversationAudioDetails = {
  type: 'empty' | 'voice' | 'noise' | 'music';
  transcription: string;
  totalTimeInSeconds: number;
  language: string;
  bars: number[];
};

export type RawConversationAudioMessage = {
  conversationId: string;
  conversationFilePattern: string | null;
  conversationContactName: string | null;
  rawMessageExternalId: string;
  rawMessageSentAt: string | null;
  normalizedFields: Record<string, unknown>;
  audioDetails?: RawConversationAudioDetails;
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
  filePattern: string | null;
  contactName: string | null;
  firstMessageDate: string | null;
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
  upsertRawMessageAudioDetails(
    conversationId: string,
    rawMessageExternalId: string,
    audioDetails: RawConversationAudioDetails
  ): Promise<void>;
  updateConversationFilePattern(conversationId: string, filePattern: string): Promise<void>;
  findRawMessagesWithAudioAttachment(): Promise<RawConversationAudioMessage[]>;
  deleteAllConversations(): Promise<number>;
}
