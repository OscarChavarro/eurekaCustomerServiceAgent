import { Inject, Injectable } from '@nestjs/common';
import type { LlmChatCompletionsPort } from '../../ports/outbound/chat/llm-chat-completions.port';
import { TOKENS } from '../../ports/tokens';
import { GenerateContextUseCase } from '../context-generation/generate-context.use-case';
import type { StreamChatCompletionsCommand } from './stream-chat-completions.command';

const SYSTEM_PROMPT_INSTRUCTIONS = [
  'Use the following information to answer the user naturally.',
  'Do not mention sources, conversations, or records.',
  'Respond as if this knowledge is your own.'
].join('\n');

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
      content: `${SYSTEM_PROMPT_INSTRUCTIONS}\n\n${contextMessage}`.trim()
    };

    return this.llmChatCompletionsPort.streamChatCompletion({
      messages: [systemMessage, ...command.messages],
      maxTokens: command.maxTokens,
      stream: true
    });
  }
}
