import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ContextGenerator,
  GenerateContextInput,
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
  private static readonly PRICE_CATALOG_RELATIVE_PATH = 'retrievalBackend/etc/_eureka/priceCatalog.csv';
  private readonly logger = new Logger(VectorSearchContextGenerator.name);

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async generateContext(input: GenerateContextInput): Promise<string> {
    this.logger.log(this.formatPayloadMessagesLog(input.messages));

    const latestUserPrompt = this.extractLatestUserPrompt(input.messages);
    if (!latestUserPrompt) {
      return 'No se encontro un mensaje de usuario para construir contexto. Responde de forma breve y solicita aclaracion.';
    }

    const promptVector = await this.generatePromptEmbedding(latestUserPrompt);
    const nearestPoints = await this.searchNearestPoints(promptVector);
    const uniqueAgentResponses = this.extractUniqueAgentResponses(nearestPoints);
    const context = this.composeContext(uniqueAgentResponses);
    this.logger.log(`**** USER PROMPT: ${latestUserPrompt}`);
    this.logger.log(this.formatFlowLog(uniqueAgentResponses, context));

    return context;
  }

  private formatPayloadMessagesLog(messages: ContextGeneratorMessage[]): string {
    const messageLines =
      messages.length > 0
        ? messages.map((message) => `- ${message.role}: ${message.content}`)
        : ['- (no messages in payload)'];

    return [
      'Payload messages:',
      messageLines.join('\n'),
      '----'
    ].join('\n');
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

  private toRetrievedChunkMessage(
    rawMessage: unknown
  ): { role: 'agent' | 'customer'; text: string } | null {
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

  private composeContext(qdrantFindings: string[]): string {
    const productCatalogHints = this.loadProductCatalogHints();
    const businessFindings =
      qdrantFindings.length > 0
        ? qdrantFindings
        : ['No hay hallazgos relevantes recuperados desde Qdrant.'];

    return [
      '# Pistas',
      '',
      '## Catálogo de producto',
      ...productCatalogHints.map((hint) => `- ${hint}`),
      '',
      '## Hechos de negocio relevantes para responder al usuario',
      ...businessFindings.map((finding) => `- ${finding}`),
      '',
      'para las siguientes secciones ten en cuenta estas pistas',
      '',
      this.serviceConfig.contextGeneratorConfig.naive.contextMessage.trim()
    ]
      .map((line) => line.trimEnd())
      .join('\n');
  }

  private loadProductCatalogHints(): string[] {
    const csvPath = this.resolvePriceCatalogPath();
    const csvContent = readFileSync(csvPath, 'utf-8').trim();
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length <= 1) {
      return ['No hay productos cargados en el catálogo.'];
    }

    const headerLine = lines[0];
    if (!headerLine) {
      return ['No hay productos cargados en el catálogo.'];
    }

    const headers = this.parseCsvLine(headerLine).map((header) => header.trim());
    const nameIndex = headers.indexOf('name');
    const priceIndex = headers.indexOf('price_eur');
    const colorsIndex = headers.indexOf('number_of_colors');
    const orderIndex = headers.indexOf('colors_in_order');

    if (nameIndex < 0 || priceIndex < 0 || colorsIndex < 0 || orderIndex < 0) {
      return ['No fue posible interpretar el catálogo de productos.'];
    }

    return lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      const name = values[nameIndex]?.trim() ?? 'Producto sin nombre';
      const price = values[priceIndex]?.trim() ?? 'N/D';
      const numberOfColors = values[colorsIndex]?.trim() ?? 'N/D';
      const colorsInOrder = values[orderIndex]?.trim() ?? 'N/D';

      return `${name} (EUR ${price}, colores=${numberOfColors}, colors_in_order=${colorsInOrder})`;
    });
  }

  private resolvePriceCatalogPath(): string {
    const directPath = resolve(process.cwd(), VectorSearchContextGenerator.PRICE_CATALOG_RELATIVE_PATH);
    if (existsSync(directPath)) {
      return directPath;
    }

    const monorepoPath = resolve(process.cwd(), '..', VectorSearchContextGenerator.PRICE_CATALOG_RELATIVE_PATH);
    if (existsSync(monorepoPath)) {
      return monorepoPath;
    }

    throw new Error(`Price catalog file not found: ${directPath} (or ${monorepoPath}).`);
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (insideQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
          continue;
        }

        insideQuotes = !insideQuotes;
        continue;
      }

      if (character === ',' && !insideQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    values.push(current);
    return values;
  }
}
