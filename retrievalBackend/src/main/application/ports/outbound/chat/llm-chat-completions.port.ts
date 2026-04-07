export type ChatCompletionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type StreamChatCompletionCommand = {
  messages: ChatCompletionMessage[];
  maxTokens: number;
  stream: boolean;
};

export interface LlmChatCompletionsPort {
  streamChatCompletion(command: StreamChatCompletionCommand): Promise<Response>;
}
