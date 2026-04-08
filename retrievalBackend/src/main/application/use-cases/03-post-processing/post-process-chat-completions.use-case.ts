import { Injectable } from '@nestjs/common';

export type PostProcessChatCompletionsCommand = {
  llmRawBody: string;
  showUsedContext: boolean;
  contextMessage: string;
};

@Injectable()
export class PostProcessChatCompletionsUseCase {
  public execute(command: PostProcessChatCompletionsCommand): unknown {
    const parsedPayload = JSON.parse(command.llmRawBody) as unknown;
    const sanitizedPayload = this.sanitizeLlmResponsePayload(parsedPayload);

    if (!command.showUsedContext || !this.isRecord(sanitizedPayload)) {
      return sanitizedPayload;
    }

    return {
      ...sanitizedPayload,
      used_context_lines: this.extractContextLines(command.contextMessage)
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

  private extractContextLines(contextMessage: string): string[] {
    return contextMessage
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
