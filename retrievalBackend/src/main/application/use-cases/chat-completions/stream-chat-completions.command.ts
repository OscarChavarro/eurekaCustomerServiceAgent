export type WrapperChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type WrapperChatHint = {
  customerId: string;
};

export type StreamChatCompletionsCommand = {
  messages: WrapperChatMessage[];
  hints?: WrapperChatHint;
  maxTokens: number;
  showUsedContext: boolean;
};
