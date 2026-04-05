import { Inject, Injectable } from '@nestjs/common';
import type { LlmChatCompletionsPort } from '../../ports/outbound/chat/llm-chat-completions.port';
import { TOKENS } from '../../ports/tokens';
import type { StreamChatCompletionsCommand } from './stream-chat-completions.command';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class StreamChatCompletionsUseCase {
  constructor(
    @Inject(TOKENS.LlmChatCompletionsPort)
    private readonly llmChatCompletionsPort: LlmChatCompletionsPort,
    private readonly serviceConfig: ServiceConfig
  ) {}

  public async execute(command: StreamChatCompletionsCommand): Promise<Response> {
    const systemMessage = {
      role: 'system' as const,
      content: this.serviceConfig.llmConfig.contextMessage
    };

    return this.llmChatCompletionsPort.streamChatCompletion({
      messages: [systemMessage, ...command.messages],
      maxTokens: command.maxTokens,
      stream: true
    });
  }
}
