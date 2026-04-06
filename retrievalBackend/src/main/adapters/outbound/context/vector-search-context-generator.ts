import { Injectable, Logger } from '@nestjs/common';
import type {
  ContextGenerator,
  ContextGeneratorMessage
} from '../../../application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

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

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateContext(messages: ContextGeneratorMessage[]): Promise<string> {
    const latestUserPrompt = this.extractLatestUserPrompt(messages);
    if (!latestUserPrompt) {
      const emptyPromptContext =
        'No se encontro un mensaje de usuario para construir contexto. Responde de forma breve y solicita aclaracion.';
      this.logger.log(`Generated context (vector-search):\n${emptyPromptContext}\n====================`);
      return emptyPromptContext;
    }

    const promptVector = await this.generatePromptEmbedding(latestUserPrompt);
    const nearestPoints = await this.searchNearestPoints(promptVector);
    const context = this.buildSystemContext(latestUserPrompt, nearestPoints);

    this.logger.log(`Generated context (vector-search):\n${context}\n====================`);

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

  private buildSystemContext(prompt: string, points: QdrantPoint[]): string {
    const baseInstructions = [
      'Eres un asistente de atencion al cliente para WhatsApp.',
      'Responde siempre en espanol, con frases cortas y concretas.',
      'Usa primero la evidencia recuperada de conversaciones similares.',
      'Si la evidencia no alcanza, dilo de forma explicita y pregunta lo minimo necesario para continuar.'
    ];

    if (points.length === 0) {
      return [
        ...baseInstructions,
        '',
        `Prompt actual del usuario: ${prompt}`,
        'No se encontraron conversaciones similares en Qdrant.'
      ].join('\n');
    }

    const evidenceLines = points.map((point, index) => {
      const conversationId =
        typeof point.payload?.conversationId === 'string' ? point.payload.conversationId : 'unknown';
      const chunkId = typeof point.payload?.chunkId === 'string' ? point.payload.chunkId : 'unknown';
      const chunkMessage =
        typeof point.payload?.chunkMessage === 'string' ? point.payload.chunkMessage : '';
      const messageIds = Array.isArray(point.payload?.messageIds)
        ? point.payload.messageIds.filter((item): item is string => typeof item === 'string')
        : [];
      const score = Number.isFinite(point.score) ? point.score.toFixed(4) : 'n/a';

      const formattedChunkMessage = this.formatChunkMessage(chunkMessage);

      return [
        `- Fuente ${index + 1} (score=${score})`,
        `  - conversationId: ${conversationId}`,
        `  - chunkId: ${chunkId}`,
        `  - messageIds: ${messageIds.join(', ') || 'none'}`,
        '  - chunkMessage:',
        ...formattedChunkMessage.map((line) => `  . ${line}`)
      ].join('\n');
    });

    return [
      ...baseInstructions,
      '',
      `Prompt actual del usuario: ${prompt}`,
      '',
      'Evidencia recuperada desde Qdrant:',
      ...evidenceLines
    ].join('\n');
  }

  private formatChunkMessage(chunkMessage: string): string[] {
    const normalized = chunkMessage.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return ['(vacio)'];
    }

    const segments = normalized
      .split(/(?=Cliente:|Agente:)/g)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    return segments.length > 0 ? segments : [normalized];
  }
}
