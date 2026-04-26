import { Injectable } from '@nestjs/common';
import type {
  ConversationMessageEvidence,
  SemanticProbeMatch
} from '../../../domain/conversation-stage/conversation-stage-inference.types';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import type { QdrantConversationSearchPort } from '../../../ports/outbound/qdrant-conversation-search.port';

type QdrantPointPayload = Record<string, unknown>;

type QdrantPoint = {
  id?: string | number;
  score?: number;
  payload?: QdrantPointPayload;
};

type QdrantScrollResponse = {
  result?: {
    points?: QdrantPoint[];
  };
};

type QdrantSearchResponse = {
  result?: QdrantPoint[];
};

type RawMessagePayload = {
  externalId?: string;
  sentAt?: string | null;
  text?: string;
};

@Injectable()
export class QdrantConversationSearchAdapter implements QdrantConversationSearchPort {
  private static readonly PRIMARY_FILTER_KEY = 'conversationId';
  private static readonly FALLBACK_FILTER_KEYS = ['conversation_id', 'chatId', 'phone', 'phoneNumber'];

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async listConversationMessages(conversationId: string, limit: number): Promise<ConversationMessageEvidence[]> {
    const points = await this.findPointsByConversation(conversationId, limit);
    const collected = new Map<string, ConversationMessageEvidence>();

    for (const point of points) {
      const evidences = this.mapPointToMessageEvidence(point);

      for (const evidence of evidences) {
        const dedupeKey = `${evidence.messageId}|${evidence.timestamp}`;
        if (!collected.has(dedupeKey)) {
          collected.set(dedupeKey, evidence);
        }
      }
    }

    return Array.from(collected.values())
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(0, limit);
  }

  public async searchSemanticSignals(
    conversationId: string,
    probeVectors: Array<{ probeName: string; vector: number[] }>,
    topK: number
  ): Promise<SemanticProbeMatch[]> {
    const results: SemanticProbeMatch[] = [];

    for (const probe of probeVectors) {
      const points = await this.searchPointsByVector(conversationId, probe.vector, topK);
      const matches = points
        .map((point) => this.mapPointToSemanticEvidence(point))
        .filter((item): item is ConversationMessageEvidence => item !== null)
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, topK);

      results.push({
        probeName: probe.probeName,
        matches
      });
    }

    return results;
  }

  private async findPointsByConversation(conversationId: string, limit: number): Promise<QdrantPoint[]> {
    const primary = await this.scrollByConversation(conversationId, limit, QdrantConversationSearchAdapter.PRIMARY_FILTER_KEY);
    if (primary.length > 0) {
      return primary;
    }

    for (const filterKey of QdrantConversationSearchAdapter.FALLBACK_FILTER_KEYS) {
      const points = await this.scrollByConversation(conversationId, limit, filterKey);
      if (points.length > 0) {
        return points;
      }
    }

    return [];
  }

  private async searchPointsByVector(
    conversationId: string,
    vector: number[],
    limit: number
  ): Promise<QdrantPoint[]> {
    const primary = await this.searchByVector(conversationId, vector, limit, QdrantConversationSearchAdapter.PRIMARY_FILTER_KEY);
    if (primary.length > 0) {
      return primary;
    }

    for (const filterKey of QdrantConversationSearchAdapter.FALLBACK_FILTER_KEYS) {
      const points = await this.searchByVector(conversationId, vector, limit, filterKey);
      if (points.length > 0) {
        return points;
      }
    }

    return [];
  }

  private async scrollByConversation(conversationId: string, limit: number, filterKey: string): Promise<QdrantPoint[]> {
    const qdrantConfig = this.serviceConfig.qdrantConfig;
    const url = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points/scroll`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        with_payload: true,
        with_vector: false,
        limit,
        filter: {
          must: [
            {
              key: filterKey,
              match: {
                value: conversationId
              }
            }
          ]
        }
      }),
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      throw new Error(`Qdrant scroll failed at ${url}: returned ${response.status} ${response.statusText}.`);
    }

    const payload = (await response.json()) as QdrantScrollResponse;
    return Array.isArray(payload.result?.points) ? payload.result.points : [];
  }

  private async searchByVector(
    conversationId: string,
    vector: number[],
    limit: number,
    filterKey: string
  ): Promise<QdrantPoint[]> {
    const qdrantConfig = this.serviceConfig.qdrantConfig;
    const url = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points/search`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        vector,
        with_payload: true,
        with_vector: false,
        limit,
        filter: {
          must: [
            {
              key: filterKey,
              match: {
                value: conversationId
              }
            }
          ]
        }
      }),
      signal: AbortSignal.timeout(12_000)
    });

    if (!response.ok) {
      throw new Error(`Qdrant semantic search failed at ${url}: returned ${response.status} ${response.statusText}.`);
    }

    const payload = (await response.json()) as QdrantSearchResponse;
    return Array.isArray(payload.result) ? payload.result : [];
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    const apiKey = this.serviceConfig.qdrantConfig.apiKey?.trim();

    if (apiKey) {
      headers['api-key'] = apiKey;
    }

    return headers;
  }

  private mapPointToMessageEvidence(point: QdrantPoint): ConversationMessageEvidence[] {
    const payload = point.payload;
    if (!payload) {
      return [];
    }

    const chunkId = this.readString(payload, ['chunkId']) ?? String(point.id ?? '');
    const chunkMessage = this.readString(payload, ['chunkMessage']);
    const rawMessages = this.readRawMessages(payload);
    const rawEvidence: ConversationMessageEvidence[] = rawMessages
      .map((rawMessage, index) => {
        const text = typeof rawMessage.text === 'string' ? rawMessage.text.trim() : '';
        if (text.length === 0) {
          return null;
        }

        const messageIdRaw = typeof rawMessage.externalId === 'string' ? rawMessage.externalId.trim() : '';
        const messageId = messageIdRaw.length > 0 ? messageIdRaw : `${chunkId}-raw-${index + 1}`;
        const timestamp = this.normalizeIso(rawMessage.sentAt) ?? new Date(0).toISOString();

        return {
          messageId,
          text,
          timestamp
        };
      })
      .filter((item): item is ConversationMessageEvidence => item !== null);

    if (rawEvidence.length > 0) {
      return rawEvidence;
    }

    if (!chunkMessage) {
      return [];
    }

    return [
      {
        messageId: chunkId || String(point.id ?? 'unknown'),
        text: chunkMessage,
        timestamp: new Date(0).toISOString()
      }
    ];
  }

  private mapPointToSemanticEvidence(point: QdrantPoint): ConversationMessageEvidence | null {
    const payload = point.payload;
    if (!payload) {
      return null;
    }

    const chunkId = this.readString(payload, ['chunkId']) ?? String(point.id ?? '');
    const chunkMessage = this.readString(payload, ['chunkMessage']);
    const rawMessages = this.readRawMessages(payload);
    const lastRaw = rawMessages.at(-1);
    const timestamp = this.normalizeIso(lastRaw?.sentAt) ?? new Date(0).toISOString();

    if (chunkMessage) {
      return {
        messageId: chunkId,
        text: chunkMessage,
        timestamp,
        score: point.score
      };
    }

    const fallbackRaw = rawMessages.find((item) => typeof item.text === 'string' && item.text.trim().length > 0);
    if (!fallbackRaw || !fallbackRaw.text) {
      return null;
    }

    return {
      messageId: chunkId,
      text: fallbackRaw.text.trim(),
      timestamp,
      score: point.score
    };
  }

  private readRawMessages(payload: QdrantPointPayload): RawMessagePayload[] {
    const raw = payload['rawMessages'];

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        externalId: this.readOptionalString(item['externalId']),
        sentAt: this.readOptionalString(item['sentAt']),
        text: this.readOptionalString(item['text'])
      }));
  }

  private readString(payload: QdrantPointPayload, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private normalizeIso(value: string | null | undefined): string | null {
    if (!value || value.trim().length === 0) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }
}
