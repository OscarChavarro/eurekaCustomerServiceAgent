import { Injectable } from '@nestjs/common';
import type {
  LlmChatCompletionsPort,
  StreamChatCompletionCommand
} from '../../../application/ports/outbound/chat/llm-chat-completions.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class FetchLlmChatCompletionsAdapter implements LlmChatCompletionsPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async streamChatCompletion(command: StreamChatCompletionCommand): Promise<Response> {
    const llmConfig = this.serviceConfig.llmConfig;
    const url = `${llmConfig.host}:${llmConfig.port}${llmConfig.endpoint}`;

    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messages: command.messages,
        max_tokens: command.maxTokens,
        stream: command.stream
      })
    });
  }
}
