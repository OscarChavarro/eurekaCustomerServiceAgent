export type WrapperChatMessage = {
  role: 'user';
  content: string;
};

export type StreamChatCompletionsCommand = {
  messages: WrapperChatMessage[];
  maxTokens: number;
};
