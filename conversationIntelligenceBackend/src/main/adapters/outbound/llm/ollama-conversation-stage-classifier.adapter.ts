import { Injectable } from '@nestjs/common';
import { CustomerStage } from '../../../domain/conversation-stage/conversation-stage.types';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import type {
  LlmConversationClassificationCommand,
  LlmConversationStageClassifierPort
} from '../../../ports/outbound/llm-conversation-stage-classifier.port';
import type { LlmStageClassificationResult } from '../../../domain/conversation-stage/conversation-stage-inference.types';

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

type LlmResponsePayload = {
  currentStage?: string;
  summary?: string;
  detectedSignals?: string[];
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  noHint?: boolean;
};

@Injectable()
export class OllamaConversationStageClassifierAdapter implements LlmConversationStageClassifierPort {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async classify(command: LlmConversationClassificationCommand): Promise<LlmStageClassificationResult> {
    const llmConfig = this.serviceConfig.llmConfig;
    const model = this.serviceConfig.inferenceConfig.llmModel;
    const url = `${llmConfig.baseUrl}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        format: 'json',
        stream: false,
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt()
          },
          {
            role: 'user',
            content: this.buildUserPrompt(command)
          }
        ]
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`LLM classify failed at ${url}: returned ${response.status} ${response.statusText}.`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    const content = payload.message?.content?.trim();
    if (!content) {
      throw new Error('LLM classify returned an empty message.content payload.');
    }

    const parsed = this.parseLlmJson(content);
    const stage = this.toCustomerStage(parsed.currentStage, command.allowedStages);

    return {
      currentStage: stage,
      summary: parsed.summary?.trim() || 'No summary provided by LLM.',
      detectedSignals: this.normalizeSignals(parsed.detectedSignals),
      confidence: this.normalizeConfidence(parsed.confidence),
      noHint: parsed.noHint ?? stage === CustomerStage.UNIDENTIFIED
    };
  }

  private buildSystemPrompt(): string {
    return [
      'You classify customer conversation lifecycle stages from WhatsApp evidence.',
      'Return JSON only, no markdown.',
      'If evidence is weak or contradictory, set noHint=true and currentStage=UNIDENTIFIED.',
      'Detected signals must be short snake_case tokens.',
      'Use negative stages when the other party is selling to us or counterfeiting/impersonating the brand.'
    ].join(' ');
  }

  private buildUserPrompt(command: LlmConversationClassificationCommand): string {
    const recentMessages = command.messages.slice(-40).map((message) => ({
      messageId: message.messageId,
      timestamp: message.timestamp,
      text: message.text
    }));
    const compactSemanticMatches = command.semanticMatches.map((match) => ({
      probeName: match.probeName,
      matches: match.matches.slice(0, 3).map((item) => ({
        messageId: item.messageId,
        timestamp: item.timestamp,
        score: item.score,
        text: item.text
      }))
    }));

    return JSON.stringify({
      task: 'Classify conversation stage',
      conversationId: command.conversationId,
      allowedStages: command.allowedStages,
      stageGuidance: {
        UNIDENTIFIED: 'Use when there is not enough evidence to classify clearly.',
        UNSOLICITED_SELLER: 'Use when the other party tries to sell us products or services.',
        BRAND_COUNTERFEIT: 'Use when the other party appears to counterfeit, impersonate, or copy our brand.',
        SUPPORT_ISSUE: 'Use when a customer reports a problem, warranty issue, defect, refund, or complaint.',
        POST_DELIVERY: 'Use when the product has already been received and the conversation is feedback/review/follow-up.',
        DELIVERED: 'Use when delivery or receipt is confirmed.',
        SHIPPED: 'Use when shipment/tracking/dispatch is the latest clear stage.',
        WAITING_PAYMENT: 'Use when payment is pending or being arranged.',
        READY_TO_BUY: 'Use when buying intent or order confirmation is clear.'
      },
      deterministicSignals: command.deterministicSignals,
      semanticMatches: compactSemanticMatches,
      messages: recentMessages,
      responseShape: {
        currentStage: 'one of allowedStages',
        summary: 'string',
        detectedSignals: ['string'],
        confidence: 'LOW | MEDIUM | HIGH',
        noHint: 'boolean'
      }
    });
  }

  private parseLlmJson(content: string): LlmResponsePayload {
    const trimmed = content.trim();

    try {
      return JSON.parse(trimmed) as LlmResponsePayload;
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');

      if (start < 0 || end <= start) {
        throw new Error('LLM response was not valid JSON.');
      }

      return JSON.parse(trimmed.slice(start, end + 1)) as LlmResponsePayload;
    }
  }

  private toCustomerStage(value: string | undefined, allowedStages: string[]): CustomerStage {
    if (!value || !allowedStages.includes(value)) {
      return CustomerStage.UNIDENTIFIED;
    }

    const allStages = Object.values(CustomerStage);
    return allStages.includes(value as CustomerStage) ? (value as CustomerStage) : CustomerStage.UNIDENTIFIED;
  }

  private normalizeConfidence(value: LlmResponsePayload['confidence']): 'LOW' | 'MEDIUM' | 'HIGH' {
    return value === 'MEDIUM' || value === 'HIGH' ? value : 'LOW';
  }

  private normalizeSignals(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) =>
        item
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
      )
      .filter((item) => item.length > 0)
      .slice(0, 30);
  }
}
