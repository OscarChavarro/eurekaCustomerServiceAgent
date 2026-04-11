export type ConversationAudioDetails = {
  type: 'empty' | 'voice' | 'noise' | 'music';
  transcription: string;
  totalTimeInSeconds: number;
  language: string;
  bars: number[];
};

export type ConversationRawMessage = {
  externalId?: string;
  direction?: string;
  text?: string;
  sentAt?: string | null;
  audioDetails?: ConversationAudioDetails | null;
  [key: string]: unknown;
};

export type ConversationDocument = {
  _id?: string;
  rawMessages?: ConversationRawMessage[];
  [key: string]: unknown;
};

export type GetConversationMessagesResult = ConversationDocument | null;
