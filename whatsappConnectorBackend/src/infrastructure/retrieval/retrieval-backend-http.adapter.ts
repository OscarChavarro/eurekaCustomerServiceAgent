import { Injectable } from '@nestjs/common';
import { Configuration } from 'src/config/configuration';
import { RetrievalBackendPort } from 'src/ports/outbound/retrieval-backend.port';

@Injectable()
export class RetrievalBackendHttpAdapter implements RetrievalBackendPort {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs = 10000;

  constructor(configuration: Configuration) {
    this.baseUrl = configuration.retrievalBackendBaseUrl;
  }

  async assertHealth(): Promise<void> {
    const response = await this.requestJson(`${this.baseUrl}/health`);
    if (response === null || typeof response !== 'object') {
      throw new Error('retrievalBackend /health returned an invalid payload.');
    }

    const status = (response as { status?: unknown }).status;
    if (status !== 'ok') {
      throw new Error('retrievalBackend /health is not reporting status "ok".');
    }
  }

  async completeChat(prompt: string, customerId: string): Promise<string> {
    const payload = await this.requestJson(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        hints: {
          customerId
        },
        max_tokens: 1000,
        show_used_context: false
      })
    });

    const parsedText = this.extractAssistantText(payload);
    if (!parsedText) {
      throw new Error('retrievalBackend /v1/chat/completions returned an empty assistant response.');
    }

    return parsedText;
  }

  private extractAssistantText(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return null;
    }

    const firstChoice = choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
      return null;
    }

    const firstMessage = (firstChoice as { message?: unknown }).message;
    if (firstMessage && typeof firstMessage === 'object') {
      const content = (firstMessage as { content?: unknown }).content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
      }
    }

    const text = (firstChoice as { text?: unknown }).text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }

    return null;
  }

  private async requestJson(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${url} responded ${response.status} ${response.statusText}.`);
      }

      return response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to reach retrievalBackend at ${url}. ${message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
