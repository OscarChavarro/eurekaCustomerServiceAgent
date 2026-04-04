import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IngestionRuntimeConfigPort } from '../../ports/config/ingestion-runtime-config.port';
import type { ConversationCsvSourcePort } from '../../ports/inbound/conversation-csv-source.port';
import type { EmbeddingPort } from '../../ports/outbound/embedding.port';
import type { VectorPoint, VectorStorePort } from '../../ports/outbound/vector-store.port';
import { TOKENS } from '../../ports/tokens';
import { ConversationChunkingService } from './conversation-chunking.service';
import { ConversationCsvRecordTranslatorService } from './conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './conversation-message-cleaning.service';
import { ConversationStructuringService } from './conversation-structuring.service';
import type { KwoledgeIngestionCommand } from './kwoledge-ingestion.command';
import {
  CleanedConversationMessage,
  MessageDirection,
  RawConversationMessage,
  StructuredConversationTurn,
  SemanticConversationChunk
} from './kwoledge-ingestion-message.model';
import {
  KwoledgeIngestionLimits,
  KwoledgeIngestionMessagesBreakdown,
  KwoledgeIngestionResult
} from './kwoledge-ingestion.result';

type EmbeddingPayloadRawMessage = {
  conversationId: string;
  externalId: string;
  sentAt: string | null;
  sender: string | null;
  text: string;
  sourceFile: string;
  rowNumber: number;
  direction: MessageDirection;
  normalizedFields: Record<string, unknown>;
};

type EmbeddingChunkPayload = {
  rawMessages: EmbeddingPayloadRawMessage[];
  chunkMessage: string;
};

type EmbeddedChunk = {
  semanticChunk: SemanticConversationChunk;
  vector: number[];
  payload: EmbeddingChunkPayload;
};

@Injectable()
export class KwoledgeIngestionUseCase {
  private readonly logger = new Logger(KwoledgeIngestionUseCase.name);

  constructor(
    @Inject(TOKENS.ConversationCsvSourcePort)
    private readonly conversationCsvSourcePort: ConversationCsvSourcePort,
    @Inject(TOKENS.EmbeddingPort)
    private readonly embeddingPort: EmbeddingPort,
    @Inject(TOKENS.VectorStorePort)
    private readonly vectorStorePort: VectorStorePort,
    @Inject(TOKENS.IngestionRuntimeConfigPort)
    private readonly ingestionRuntimeConfigPort: IngestionRuntimeConfigPort,
    private readonly conversationCsvRecordTranslatorService: ConversationCsvRecordTranslatorService,
    private readonly conversationMessageCleaningService: ConversationMessageCleaningService,
    private readonly conversationStructuringService: ConversationStructuringService,
    private readonly conversationChunkingService: ConversationChunkingService
  ) {}

  public async execute(command: KwoledgeIngestionCommand): Promise<KwoledgeIngestionResult> {
    const rawMessages = await this.loadRawMessages(command.folderPath);
    this.logStageAsJson('RAW', rawMessages);

    const cleanedMessages = this.runCleaningStage(rawMessages);
    this.logStageAsJson('CLEAN', cleanedMessages);

    const structuredTurns = this.runStructuringStage(cleanedMessages);
    this.logStageAsJson('STRUCTURE', structuredTurns);

    const semanticChunks = this.runChunkingStage(structuredTurns);
    this.logStageAsJson('CHUNK', semanticChunks);

    const uniqueFiles = new Set(cleanedMessages.map((message) => message.sourceFile));
    const messagesBreakdown = this.buildMessagesBreakdown(cleanedMessages);
    const limits = this.buildLimits(cleanedMessages);
    const skippedMessages = cleanedMessages.filter((message) => message.cleanedText.length === 0).length;

    if (semanticChunks.length === 0) {
      this.logger.warn(`No semantic chunks found in folder ${command.folderPath}.`);
    }

    const embeddedChunks = await this.runEmbeddingStage(rawMessages, semanticChunks);
    const indexedChunks = await this.runStorageStage(embeddedChunks);

    return new KwoledgeIngestionResult(
      command.folderPath,
      uniqueFiles.size,
      indexedChunks,
      skippedMessages,
      messagesBreakdown,
      limits
    );
  }

  private async loadRawMessages(folderPath: string): Promise<RawConversationMessage[]> {
    const rawRecords = await this.conversationCsvSourcePort.readFromPath(folderPath);

    return rawRecords.map((record) => {
      const rawMessage = this.conversationCsvRecordTranslatorService.translate(record);
      return rawMessage;
    });
  }

  private runCleaningStage(rawMessages: RawConversationMessage[]): CleanedConversationMessage[] {
    return this.conversationMessageCleaningService.clean(rawMessages);
  }

  private runStructuringStage(
    cleanedMessages: CleanedConversationMessage[]
  ): StructuredConversationTurn[] {
    return this.conversationStructuringService.buildTurns(cleanedMessages);
  }

  private runChunkingStage(structuredTurns: StructuredConversationTurn[]): SemanticConversationChunk[] {
    return this.conversationChunkingService.buildSemanticChunks(structuredTurns);
  }

  private async runEmbeddingStage(
    rawMessages: RawConversationMessage[],
    semanticChunks: SemanticConversationChunk[]
  ): Promise<EmbeddedChunk[]> {
    if (semanticChunks.length === 0) {
      this.logStageAsJson('EMBED', []);
      return [];
    }

    const rawMessagesByExternalId = this.buildRawMessagesIndex(rawMessages);
    const embeddedChunks: EmbeddedChunk[] = [];
    const stagePayload: Array<{
      chunkId: string;
      payload: EmbeddingChunkPayload;
      dimensions: number;
      first10: number[];
    }> = [];

    for (const chunk of semanticChunks) {
      const payload = this.buildEmbeddingPayload(chunk, rawMessagesByExternalId);
      const vector = await this.embeddingPort.generateEmbedding(payload.chunkMessage);
      embeddedChunks.push({
        semanticChunk: chunk,
        vector,
        payload
      });

      const first10Dimensions = vector.slice(0, 10);
      stagePayload.push({
        chunkId: chunk.chunkId,
        payload,
        dimensions: vector.length,
        first10: first10Dimensions
      });
    }

    this.logStageAsJson('EMBED', stagePayload);

    return embeddedChunks;
  }

  private async runStorageStage(embeddedChunks: EmbeddedChunk[]): Promise<number> {
    if (!this.ingestionRuntimeConfigPort.isQdrantIngestionEnabled()) {
      this.logStageAsJson('STORE', {
        status: 'planned',
        reason: 'Storage stage planned. Waiting for storage stage activation.'
      });
      return 0;
    }

    if (embeddedChunks.length === 0) {
      this.logStageAsJson('STORE', []);
      return 0;
    }

    await this.vectorStorePort.ensureCollection(embeddedChunks[0]?.vector.length ?? 0);

    const points: VectorPoint[] = embeddedChunks.map((embeddedChunk, index) => {
      const vector = embeddedChunk.vector;

      if (!vector) {
        throw new Error(`Missing vector for semantic chunk index ${index}.`);
      }

      return {
        id: this.buildPointId(embeddedChunk.semanticChunk, index),
        vector,
        payload: embeddedChunk.payload
      };
    });

    this.logStageAsJson(
      'STORE',
      points.map((point) => ({
        id: point.id,
        vectorDimensions: point.vector.length,
        vectorFirst10: point.vector.slice(0, 10),
        payload: point.payload
      }))
    );

    await this.vectorStorePort.upsert(points);

    this.logger.log(`Stored ${points.length} semantic chunks in vector storage.`);

    return points.length;
  }

  private buildRawMessagesIndex(
    rawMessages: RawConversationMessage[]
  ): Map<string, RawConversationMessage> {
    const rawMessagesByExternalId = new Map<string, RawConversationMessage>();

    for (const rawMessage of rawMessages) {
      rawMessagesByExternalId.set(rawMessage.externalId, rawMessage);
    }

    return rawMessagesByExternalId;
  }

  private buildEmbeddingPayload(
    semanticChunk: SemanticConversationChunk,
    rawMessagesByExternalId: Map<string, RawConversationMessage>
  ): EmbeddingChunkPayload {
    const messageIds = this.extractChunkMessageIds(semanticChunk);
    const rawMessages = messageIds
      .map((messageId) => rawMessagesByExternalId.get(messageId))
      .filter((rawMessage): rawMessage is RawConversationMessage => rawMessage !== undefined)
      .map((rawMessage) => this.toEmbeddingPayloadRawMessage(rawMessage));

    return {
      rawMessages,
      chunkMessage: semanticChunk.content
    };
  }

  private extractChunkMessageIds(semanticChunk: SemanticConversationChunk): string[] {
    const messageIds = semanticChunk.metadata.messageIds;

    if (!Array.isArray(messageIds)) {
      return [];
    }

    return messageIds.filter((messageId): messageId is string => typeof messageId === 'string');
  }

  private toEmbeddingPayloadRawMessage(rawMessage: RawConversationMessage): EmbeddingPayloadRawMessage {
    return {
      conversationId: rawMessage.conversationId,
      externalId: rawMessage.externalId,
      sentAt: rawMessage.sentAt?.toISOString() ?? null,
      sender: rawMessage.sender,
      text: rawMessage.text,
      sourceFile: rawMessage.sourceFile,
      rowNumber: rawMessage.rowNumber,
      direction: rawMessage.direction,
      normalizedFields: rawMessage.normalizedFields as unknown as Record<string, unknown>
    };
  }

  private logStageAsJson(stage: string, payload: unknown): void {
    this.logger.log(`= ${stage} ===================`);
    this.logger.log(JSON.stringify(payload, null, 2));
  }

  private buildMessagesBreakdown(
    messages: CleanedConversationMessage[]
  ): KwoledgeIngestionMessagesBreakdown {
    const sent = messages.filter((message) => message.direction === MessageDirection.Outgoing).length;
    const totalMessages = messages.length;
    const withAssociatedMedia = messages.filter((message) => this.hasAssociatedMedia(message)).length;

    return new KwoledgeIngestionMessagesBreakdown(
      totalMessages,
      sent,
      totalMessages - sent,
      withAssociatedMedia
    );
  }

  private buildLimits(messages: CleanedConversationMessage[]): KwoledgeIngestionLimits {
    const dates = messages
      .map((message) => message.sentAt)
      .filter((sentAt): sentAt is Date => sentAt !== null)
      .map((sentAt) => sentAt.getTime());

    const conversationCounts = new Map<string, number>();
    for (const message of messages) {
      conversationCounts.set(
        message.sourceFile,
        (conversationCounts.get(message.sourceFile) ?? 0) + 1
      );
    }

    let conversationWithMostMessages: string | null = null;
    let maxCount = 0;

    for (const [sourceFile, count] of conversationCounts.entries()) {
      const shouldReplace =
        count > maxCount ||
        (count === maxCount &&
          conversationWithMostMessages !== null &&
          sourceFile.localeCompare(conversationWithMostMessages) < 0);

      if (shouldReplace || conversationWithMostMessages === null) {
        maxCount = count;
        conversationWithMostMessages = sourceFile;
      }
    }

    return new KwoledgeIngestionLimits(
      dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
      dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
      conversationWithMostMessages
    );
  }

  private hasAssociatedMedia(message: CleanedConversationMessage): boolean {
    const attachment = message.normalizedFields.attachment ?? '';
    const attachmentType = message.normalizedFields.attachmentType ?? '';
    const attachmentInfo = message.normalizedFields.attachmentInfo ?? '';

    if (!attachment && !attachmentType && !attachmentInfo) {
      return false;
    }

    const normalizedContent = this.normalizeForMatching(
      `${attachment} ${attachmentType} ${attachmentInfo}`
    );

    return (
      normalizedContent.includes('image') ||
      normalizedContent.includes('imagen') ||
      normalizedContent.includes('photo') ||
      normalizedContent.includes('foto') ||
      normalizedContent.includes('video') ||
      normalizedContent.includes('document') ||
      normalizedContent.includes('documento') ||
      normalizedContent.includes('pdf') ||
      normalizedContent.includes('doc') ||
      normalizedContent.includes('docx') ||
      normalizedContent.includes('application/') ||
      normalizedContent.includes('image/') ||
      normalizedContent.includes('video/')
    );
  }

  private normalizeForMatching(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private buildPointId(semanticChunk: SemanticConversationChunk, index: number): string {
    const hash = createHash('sha256')
      .update(`${semanticChunk.chunkId}|${semanticChunk.conversationId}|${index}`)
      .digest('hex');

    return this.toUuid(hash);
  }

  private toUuid(hex: string): string {
    const bytes = hex.slice(0, 32).split('');
    const variantByte = bytes[16] ?? '0';
    bytes[12] = '4';
    bytes[16] = (((Number.parseInt(variantByte, 16) & 0x3) | 0x8) & 0xf).toString(16);

    return [
      bytes.slice(0, 8).join(''),
      bytes.slice(8, 12).join(''),
      bytes.slice(12, 16).join(''),
      bytes.slice(16, 20).join(''),
      bytes.slice(20, 32).join('')
    ].join('-');
  }
}
