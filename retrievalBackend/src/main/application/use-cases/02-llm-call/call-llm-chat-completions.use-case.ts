import { Inject, Injectable } from '@nestjs/common';
import type {
  ChatCompletionMessage,
  LlmChatCompletionsPort
} from '../../ports/outbound/chat/llm-chat-completions.port';
import { TOKENS } from '../../ports/tokens';

export type CallLlmChatCompletionsCommand = {
  messages: ChatCompletionMessage[];
  maxTokens: number;
};

@Injectable()
export class CallLlmChatCompletionsUseCase {
  constructor(
    @Inject(TOKENS.LlmChatCompletionsPort)
    private readonly llmChatCompletionsPort: LlmChatCompletionsPort
  ) {}

  public async execute(command: CallLlmChatCompletionsCommand): Promise<Response> {
    return this.llmChatCompletionsPort.streamChatCompletion({
      messages: command.messages,
      maxTokens: command.maxTokens,
      stream: false
    });
  }
}
