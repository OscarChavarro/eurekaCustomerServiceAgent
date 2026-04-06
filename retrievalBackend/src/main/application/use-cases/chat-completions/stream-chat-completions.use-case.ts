import { Inject, Injectable } from '@nestjs/common';
import type { LlmChatCompletionsPort } from '../../ports/outbound/chat/llm-chat-completions.port';
import { TOKENS } from '../../ports/tokens';
import type { StreamChatCompletionsCommand } from './stream-chat-completions.command';

@Injectable()
export class StreamChatCompletionsUseCase {
  constructor(
    @Inject(TOKENS.LlmChatCompletionsPort)
    private readonly llmChatCompletionsPort: LlmChatCompletionsPort
  ) {}

  public async execute(command: StreamChatCompletionsCommand): Promise<Response> {
    const systemMessage = {
      role: 'system' as const,
      content: command.systemContextMessage
    };

    return this.llmChatCompletionsPort.streamChatCompletion({
      messages: [systemMessage, ...command.messages],
      maxTokens: command.maxTokens,
      stream: true
    });
  }
}
