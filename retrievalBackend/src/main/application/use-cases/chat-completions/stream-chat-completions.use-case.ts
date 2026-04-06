import { Inject, Injectable } from '@nestjs/common';
import type { LlmChatCompletionsPort } from '../../ports/outbound/chat/llm-chat-completions.port';
import { TOKENS } from '../../ports/tokens';
import { GenerateContextUseCase } from '../context-generation/generate-context.use-case';
import type { StreamChatCompletionsCommand } from './stream-chat-completions.command';

@Injectable()
export class StreamChatCompletionsUseCase {
  constructor(
    @Inject(TOKENS.LlmChatCompletionsPort)
    private readonly llmChatCompletionsPort: LlmChatCompletionsPort,
    private readonly generateContextUseCase: GenerateContextUseCase
  ) {}

  public async execute(command: StreamChatCompletionsCommand): Promise<Response> {
    const contextMessage = await this.generateContextUseCase.execute(command.messages);
    const systemMessage = {
      role: 'system' as const,
      content: contextMessage
    };

    return this.llmChatCompletionsPort.streamChatCompletion({
      messages: [systemMessage, ...command.messages],
      maxTokens: command.maxTokens,
      stream: true
    });
  }
}
