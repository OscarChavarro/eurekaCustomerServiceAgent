import { BadGatewayException, BadRequestException, Body, Controller, HttpException, Post } from '@nestjs/common';
import type {
  StreamChatCompletionsCommand,
  WrapperChatHint,
  WrapperChatMessage
} from '../../../application/use-cases/chat-completions/stream-chat-completions.command';
import { StreamChatCompletionsUseCase } from '../../../application/use-cases/chat-completions/stream-chat-completions.use-case';

const WRAPPER_RESTRICTION_USER_MESSAGE =
  'bad request: this endpoint is not a general-purpose LLM; it is a wrapper that restricts options and fills defaults.';
type AcceptedInboundRole = 'user' | 'assistant' | 'system' | 'customer' | 'agent';

@Controller('v1/chat')
export class ChatCompletionsController {
  constructor(private readonly streamChatCompletionsUseCase: StreamChatCompletionsUseCase) {}

  @Post('completions')
  public async streamChatCompletions(@Body() body: unknown): Promise<unknown> {
    const command = this.parseAndValidatePayload(body);
    const { upstreamResponse, usedContextLines } = await this.streamChatCompletionsUseCase.execute(command);
    const upstreamRawBody = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status || 502;
      throw new HttpException(
        {
          message: upstreamRawBody || 'Upstream LLM error.'
        },
        status
      );
    }

    try {
      const parsedPayload = JSON.parse(upstreamRawBody) as unknown;
      const sanitizedPayload = this.sanitizeLlmResponsePayload(parsedPayload);
      return this.attachUsedContextLinesIfRequested(sanitizedPayload, command.showUsedContext, usedContextLines);
    } catch {
      throw new BadGatewayException({
        message:
          'Upstream LLM returned a non-JSON payload. Wrapper requires JSON synchronous responses.',
        upstreamStatus: upstreamResponse.status
      });
    }
  }

  private parseAndValidatePayload(body: unknown): StreamChatCompletionsCommand {
    if (!this.isRecord(body)) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} Payload must be a JSON object.`);
    }

    const allowedRootKeys = new Set(['messages', 'hints', 'max_tokens', 'maxTokens', 'show_used_context', 'showUsedContext']);
    const receivedRootKeys = Object.keys(body);
    const forbiddenRootKeys = receivedRootKeys.filter((key) => !allowedRootKeys.has(key));

    if (forbiddenRootKeys.length > 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} Unsupported fields: ${forbiddenRootKeys.join(', ')}.`
      );
    }

    if (!('messages' in body) || (!('max_tokens' in body) && !('maxTokens' in body))) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} You must include "messages" and "max_tokens" (or "maxTokens").`
      );
    }

    const messages = body.messages;
    if (!Array.isArray(messages)) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} "messages" must be an array.`);
    }

    if (messages.length === 0) {
      throw new BadRequestException(`${WRAPPER_RESTRICTION_USER_MESSAGE} "messages" must not be empty.`);
    }

    const normalizedMessages = messages.map((message, index) => this.validateMessage(message, index));
    const hints = this.validateHints(body.hints);

    const maxTokensRaw = body.max_tokens ?? body.maxTokens;
    if (typeof maxTokensRaw !== 'number' || !Number.isInteger(maxTokensRaw) || maxTokensRaw <= 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} "max_tokens" (or "maxTokens") must be a positive integer.`
      );
    }
    const showUsedContextRaw = body.show_used_context ?? body.showUsedContext;
    if (showUsedContextRaw !== undefined && typeof showUsedContextRaw !== 'boolean') {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} "show_used_context" (or "showUsedContext") must be boolean when provided.`
      );
    }

    const hasAnyUserMessage = normalizedMessages.some((message) => message.role === 'user');
    if (!hasAnyUserMessage) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} "messages" must include at least one "user" message.`
      );
    }

    return {
      messages: normalizedMessages,
      hints,
      maxTokens: maxTokensRaw,
      showUsedContext: showUsedContextRaw ?? false
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

    const inboundRole = message.role as AcceptedInboundRole;
    if (
      inboundRole !== 'user' &&
      inboundRole !== 'system' &&
      inboundRole !== 'assistant' &&
      inboundRole !== 'customer' &&
      inboundRole !== 'agent'
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

    const normalizedContent = message.content.trim();
    if (normalizedContent.length === 0) {
      throw new BadRequestException(
        `${WRAPPER_RESTRICTION_USER_MESSAGE} messages[${index}].content must not be empty.`
      );
    }

    const normalizedRole = this.normalizeInboundRole(inboundRole);
    const role = normalizedRole === 'assistant'
      ? 'assistant'
      : normalizedRole === 'system'
        ? 'system'
        : 'user';

    return {
      role,
      content: normalizedContent
    };
  }

  private normalizeInboundRole(role: AcceptedInboundRole): 'user' | 'assistant' | 'system' {
    if (role === 'assistant' || role === 'agent') {
      return 'assistant';
    }

    if (role === 'system') {
      return 'system';
    }

    return 'user';
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

  private sanitizeLlmResponsePayload(payload: unknown): unknown {
    if (!this.isRecord(payload)) {
      return payload;
    }

    const choices = payload.choices;
    if (!Array.isArray(choices)) {
      return payload;
    }

    const sanitizedChoices = choices.map((choice) => this.sanitizeChoice(choice));
    return {
      ...payload,
      choices: sanitizedChoices
    };
  }

  private attachUsedContextLinesIfRequested(
    payload: unknown,
    showUsedContext: boolean,
    usedContextLines: string[] | undefined
  ): unknown {
    if (!showUsedContext || !this.isRecord(payload)) {
      return payload;
    }

    return {
      ...payload,
      used_context_lines: usedContextLines ?? []
    };
  }

  private sanitizeChoice(choice: unknown): unknown {
    if (!this.isRecord(choice)) {
      return choice;
    }

    const sanitizedChoice: Record<string, unknown> = { ...choice };

    if (typeof choice.text === 'string') {
      sanitizedChoice.text = this.sanitizeGeneratedText(choice.text);
    }

    const message = choice.message;
    if (this.isRecord(message) && typeof message.content === 'string') {
      sanitizedChoice.message = {
        ...message,
        content: this.sanitizeGeneratedText(message.content)
      };
    }

    return sanitizedChoice;
  }

  private sanitizeGeneratedText(text: string): string {
    const phrases = text.match(/[^!.]+[!.]?/g) ?? [text];

    const sanitized = phrases
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase.length > 0)
      .filter((phrase) => !phrase.toLowerCase().includes('genial!'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return this.fixMalformedUrls(sanitized);
  }

  private fixMalformedUrls(text: string): string {
    let fixed = text;

    const replacements: Array<[RegExp, string]> = [
      [/(https?:\/\/\S+)\s+\.(\S+)/gi, '$1.$2'],
      [/(https?:\/\/\S+)\s+\/(\S+)/gi, '$1/$2'],
      [/(https?:\/\/\S+)\s+\?(\S+)/gi, '$1?$2'],
      [/(https?:\/\/\S+)\s+#(\S+)/gi, '$1#$2'],
      [/(https?:\/\/\S+)\s+&(\S+)/gi, '$1&$2'],
      [/(https?:\/\/\S+)\s+=(\S+)/gi, '$1=$2']
    ];

    for (const [pattern, replacement] of replacements) {
      fixed = fixed.replace(pattern, replacement);
    }

    return fixed;
  }
}
