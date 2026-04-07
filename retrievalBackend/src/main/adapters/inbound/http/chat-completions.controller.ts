import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import type {
  StreamChatCompletionsCommand,
  WrapperChatHint,
  WrapperChatMessage
} from '../../../application/use-cases/chat-completions/stream-chat-completions.command';
import { StreamChatCompletionsUseCase } from '../../../application/use-cases/chat-completions/stream-chat-completions.use-case';

const WRAPPER_RESTRICTION_USER_MESSAGE =
  'bad request: this endpoint is not a general-purpose LLM; it is a wrapper that restricts options and fills defaults.';
type HttpStreamResponse = {
  status(code: number): HttpStreamResponse;
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  flush?: () => void;
  write(chunk: Buffer): void;
  end(chunk?: string): void;
};

@Controller('v1/chat')
export class ChatCompletionsController {
  constructor(private readonly streamChatCompletionsUseCase: StreamChatCompletionsUseCase) {}

  @Post('completions')
  public async streamChatCompletions(@Body() body: unknown, @Res() response: HttpStreamResponse): Promise<void> {
    const command = this.parseAndValidatePayload(body);
    const upstreamResponse = await this.streamChatCompletionsUseCase.execute(command);

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorBody = await upstreamResponse.text();
      const status = upstreamResponse.status || 502;
      response.status(status);
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          message: errorBody || 'Upstream LLM error.'
        })
      );
      return;
    }

    response.status(upstreamResponse.status);
    response.setHeader('content-type', upstreamResponse.headers.get('content-type') ?? 'text/event-stream');
    response.setHeader('cache-control', upstreamResponse.headers.get('cache-control') ?? 'no-cache');
    response.setHeader('connection', 'keep-alive');
    response.setHeader('x-accel-buffering', 'no');

    if (typeof response.flushHeaders === 'function') {
      response.flushHeaders();
    }

    const reader = upstreamResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          response.write(Buffer.from(value));
          if (typeof response.flush === 'function') {
            response.flush();
          }
        }

        if (done) {
          break;
        }
      }
    } finally {
      await this.flushBeforeEnd();
      response.end();
    }
  }

  private parseAndValidatePayload(body: unknown): StreamChatCompletionsCommand {
    if (!this.isRecord(body)) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} Payload must be a JSON object.`);
    }

    const allowedRootKeys = new Set(['messages', 'hints', 'max_tokens']);
    const receivedRootKeys = Object.keys(body);
    const forbiddenRootKeys = receivedRootKeys.filter((key) => !allowedRootKeys.has(key));

    if (forbiddenRootKeys.length > 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} Unsupported fields: ${forbiddenRootKeys.join(', ')}.`
      );
    }

    if (!('messages' in body) || !('max_tokens' in body)) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} You must include "messages" and "max_tokens".`
      );
    }

    const messages = body.messages;
    if (!Array.isArray(messages)) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} "messages" must be an array.`);
    }

    const normalizedMessages = messages.map((message, index) => this.validateMessage(message, index));
    const hints = this.validateHints(body.hints);

    const maxTokensRaw = body.max_tokens;
    if (typeof maxTokensRaw !== 'number' || !Number.isInteger(maxTokensRaw) || maxTokensRaw <= 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} "max_tokens" must be a positive integer.`
      );
    }

    return {
      messages: normalizedMessages,
      hints,
      maxTokens: maxTokensRaw
    };
  }

  private validateMessage(message: unknown, index: number): WrapperChatMessage {
    if (!this.isRecord(message)) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} messages[${index}] must be an object.`
      );
    }

    const allowedMessageKeys = new Set(['role', 'content']);
    const messageKeys = Object.keys(message);
    const forbiddenMessageKeys = messageKeys.filter((key) => !allowedMessageKeys.has(key));

    if (forbiddenMessageKeys.length > 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} messages[${index}] has unsupported fields: ${forbiddenMessageKeys.join(', ')}.`
      );
    }

    if (
      message.role !== 'user' &&
      message.role !== 'system' &&
      message.role !== 'assistant' &&
      message.role !== 'customer' &&
      message.role !== 'agent'
    ) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} messages[${index}].role must be "user", "assistant", "system", "customer" or "agent".`
      );
    }

    if (typeof message.content !== 'string') {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} messages[${index}].content must be a string.`
      );
    }

    const role = message.role === 'assistant' || message.role === 'agent'
      ? 'assistant'
      : message.role === 'system'
        ? 'system'
        : 'user';

    return {
      role,
      content: message.content
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private validateHints(hints: unknown): WrapperChatHint | undefined {
    if (hints === undefined) {
      return undefined;
    }

    if (!this.isRecord(hints)) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} "hints" must be an object.`);
    }

    const normalizedCustomerId =
      typeof hints.customerId === 'string'
        ? hints.customerId
        : typeof hints['customerId:'] === 'string'
          ? hints['customerId:']
          : null;

    if (!normalizedCustomerId || normalizedCustomerId.trim().length === 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} "hints.customerId" must be a non-empty string.`
      );
    }

    return {
      customerId: normalizedCustomerId.trim()
    };
  }

  private async flushBeforeEnd(): Promise<void> {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
