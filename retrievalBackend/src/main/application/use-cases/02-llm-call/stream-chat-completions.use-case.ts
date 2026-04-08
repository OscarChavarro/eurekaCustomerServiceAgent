import { Injectable } from '@nestjs/common';
import { GenerateContextUseCase } from '../01-context-builder/generate-context.use-case';
import { CallLlmChatCompletionsUseCase } from './call-llm-chat-completions.use-case';
import type { StreamChatCompletionsCommand } from './stream-chat-completions.command';

const SYSTEM_PROMPT_INSTRUCTIONS = [
  'Use the following information to answer the user naturally.',
  'Do not mention sources, conversations, or records.',
  'Respond as if this knowledge is your own.'
].join('\n');

export type StreamChatCompletionsResult = {
  upstreamResponse: Response;
  contextMessage: string;
};

@Injectable()
export class StreamChatCompletionsUseCase {
  constructor(
    private readonly generateContextUseCase: GenerateContextUseCase,
    private readonly callLlmChatCompletionsUseCase: CallLlmChatCompletionsUseCase
  ) {}

  public async execute(command: StreamChatCompletionsCommand): Promise<StreamChatCompletionsResult> {
    const contextMessage = await this.generateContextUseCase.execute({
      messages: command.messages
    });
    const systemMessage = {
      role: 'system' as const,
      content: `${SYSTEM_PROMPT_INSTRUCTIONS}\n\n${contextMessage}`.trim()
    };

    const upstreamResponse = await this.callLlmChatCompletionsUseCase.execute({
      messages: [systemMessage, ...command.messages],
      maxTokens: command.maxTokens
    });

    return {
      upstreamResponse,
      contextMessage
    };
  }
}
