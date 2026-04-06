import { Injectable, Logger } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../../application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import {
  HeuristicContextBuilderService,
  type RetrievedChunk
} from '../../../../application/services/context-builder.service';

interface BgeEmbeddingResponse {
  vector: number[];
}

interface QdrantPoint {
  id: string | number;
  score: number;
  payload?: {
    conversationId?: unknown;
    chunkId?: unknown;
    messageIds?: unknown;
    chunkMessage?: unknown;
    rawMessages?: unknown;
    [key: string]: unknown;
  };
}

interface QdrantSearchResponse {
  result?: QdrantPoint[];
}

@Injectable()
export class VectorSearchContextGenerator implements ContextGenerator {
  private static readonly EXPECTED_BGE_VECTOR_DIMENSIONS = 1024;
  private readonly logger = new Logger(VectorSearchContextGenerator.name);

  constructor(
    private readonly serviceConfig: ServiceConfig,
    private readonly contextBuilder: HeuristicContextBuilderService
  ) {}

  public async generateContext(messages: ContextGeneratorMessage[]): Promise<string> {
    const latestUserPrompt = this.extractLatestUserPrompt(messages);
    if (!latestUserPrompt) {
      return 'No se encontro un mensaje de usuario para construir contexto. Responde de forma breve y solicita aclaracion.';
    }

    const promptVector = await this.generatePromptEmbedding(latestUserPrompt);
    const nearestPoints = await this.searchNearestPoints(promptVector);
    const uniqueAgentResponses = this.extractUniqueAgentResponses(nearestPoints);
    const retrievedChunks = this.toRetrievedChunks(nearestPoints);
    const context = this.contextBuilder.buildContext(latestUserPrompt, retrievedChunks);
    this.logger.log(`**** USER PROMPT: ${latestUserPrompt}`);
    this.logger.log(this.formatFlowLog(uniqueAgentResponses, context));

    return context;
  }

  private extractLatestUserPrompt(messages: ContextGeneratorMessage[]): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!message || message.role !== 'user') {
        continue;
      }

      const content = message.content.trim();
      if (content.length > 0) {
        return content;
      }
    }

    return null;
  }

  private async generatePromptEmbedding(prompt: string): Promise<number[]> {
    const embeddingConfig = this.serviceConfig.embeddingConfig;
    const provider = embeddingConfig.provider.trim().toLowerCase();

    if (provider !== 'bge') {
      throw new Error(`Unsupported embedding provider "${embeddingConfig.provider}".`);
    }

    const endpoint = `http://${embeddingConfig.host}:${embeddingConfig.port}/embed`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: prompt })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as BgeEmbeddingResponse;
    if (!Array.isArray(payload.vector) || payload.vector.some((value) => typeof value !== 'number')) {
      throw new Error('Embedding response is invalid. Expected { "vector": number[] }.');
    }

    if (payload.vector.length !== VectorSearchContextGenerator.EXPECTED_BGE_VECTOR_DIMENSIONS) {
      throw new Error(
        `Embedding dimensions mismatch. Expected ${VectorSearchContextGenerator.EXPECTED_BGE_VECTOR_DIMENSIONS}, received ${payload.vector.length}.`
      );
    }

    return payload.vector;
  }

  private async searchNearestPoints(promptVector: number[]): Promise<QdrantPoint[]> {
    const qdrantConfig = this.serviceConfig.qdrantConfig;
    const searchUrl = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points/search`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    if (qdrantConfig.apiKey) {
      headers['api-key'] = qdrantConfig.apiKey;
    }

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        vector: promptVector,
        limit: this.serviceConfig.contextGeneratorConfig.vectorSearch.maxMatches,
        with_payload: true,
        with_vector: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Qdrant search request failed: ${response.status} ${response.statusText}. ${body}`);
    }

    const payload = (await response.json()) as QdrantSearchResponse;
    return Array.isArray(payload.result) ? payload.result : [];
  }

  private toRetrievedChunks(points: QdrantPoint[]): RetrievedChunk[] {
    return points.map((point) => {
      const chunkMessage =
        typeof point.payload?.chunkMessage === 'string' ? point.payload.chunkMessage : '';
      const rawMessages = Array.isArray(point.payload?.rawMessages)
        ? point.payload.rawMessages
        : [];
      const messages = rawMessages
        .map((rawMessage) => this.toRetrievedChunkMessage(rawMessage))
        .filter((message): message is RetrievedChunk['messages'][number] => message !== null);
      const textFromMessages = messages
        .filter((message) => message.role === 'agent')
        .map((message) => message.text.trim())
        .join(' ')
        .trim();
      const chunkText = textFromMessages.length > 0 ? textFromMessages : chunkMessage;

      return {
        text: chunkText,
        score: point.score,
        messages
      };
    });
  }

  private toRetrievedChunkMessage(
    rawMessage: unknown
  ): RetrievedChunk['messages'][number] | null {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return null;
    }

    const text = (rawMessage as { text?: unknown }).text;
    const direction = (rawMessage as { direction?: unknown }).direction;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return null;
    }

    if (direction === 'outgoing') {
      return {
        role: 'agent',
        text
      };
    }

    if (direction === 'incoming') {
      return {
        role: 'customer',
        text
      };
    }

    return null;
  }

  private extractUniqueAgentResponses(evidences: QdrantPoint[]): string[] {
    const uniqueResponses: string[] = [];
    const seen = new Set<string>();

    for (const evidence of evidences) {
      const rawMessages = Array.isArray(evidence.payload?.rawMessages)
        ? evidence.payload.rawMessages
        : [];

      for (const rawMessage of rawMessages) {
        const parsedMessage = this.toRetrievedChunkMessage(rawMessage);
        if (!parsedMessage || parsedMessage.role !== 'agent') {
          continue;
        }

        const cleanedText = this.cleanAgentLabel(parsedMessage.text);
        if (!cleanedText) {
          continue;
        }

        const dedupKey = cleanedText.toLowerCase();
        if (seen.has(dedupKey)) {
          continue;
        }

        seen.add(dedupKey);
        uniqueResponses.push(cleanedText);
      }
    }

    return uniqueResponses;
  }

  private cleanAgentLabel(text: string): string {
    return text
      .replace(/\bagente\s*:\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatFlowLog(uniqueAgentResponses: string[], context: string): string {
    const evidenceLines =
      uniqueAgentResponses.length > 0
        ? uniqueAgentResponses.map((response) => `- ${response}`)
        : ['- (no agent responses retrieved)'];

    return [
      'Qdrant findings (unique agent responses):',
      evidenceLines.join('\n'),
      '----',
      'Generated context:',
      context,
      '============'
    ].join('\n');
  }
}
