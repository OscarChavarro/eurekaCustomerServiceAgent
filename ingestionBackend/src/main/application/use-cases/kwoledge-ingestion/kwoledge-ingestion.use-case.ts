import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IngestionRuntimeConfigPort } from '../../ports/config/ingestion-runtime-config.port';
import type { ConversationCsvSourcePort } from '../../ports/inbound/conversation-csv-source.port';
import type { EmbeddingGeneratorPort } from '../../ports/outbound/embedding-generator.port';
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

@Injectable()
export class KwoledgeIngestionUseCase {
  private readonly logger = new Logger(KwoledgeIngestionUseCase.name);
  private readonly embeddingStageReady = false;

  constructor(
    @Inject(TOKENS.ConversationCsvSourcePort)
    private readonly conversationCsvSourcePort: ConversationCsvSourcePort,
    @Inject(TOKENS.EmbeddingGeneratorPort)
    private readonly embeddingGeneratorPort: EmbeddingGeneratorPort,
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
    const cleanedMessages = this.runCleaningStage(rawMessages);
    const structuredTurns = this.runStructuringStage(cleanedMessages);
    const semanticChunks = this.runChunkingStage(structuredTurns);

    const uniqueFiles = new Set(cleanedMessages.map((message) => message.sourceFile));
    const messagesBreakdown = this.buildMessagesBreakdown(cleanedMessages);
    const limits = this.buildLimits(cleanedMessages);
    const skippedMessages = cleanedMessages.filter((message) => message.cleanedText.length === 0).length;

    if (semanticChunks.length === 0) {
      this.logger.warn(`No semantic chunks found in folder ${command.folderPath}.`);
    }

    const embeddings = await this.runEmbeddingStage(semanticChunks);
    const indexedChunks = await this.runStorageStage(semanticChunks, embeddings);

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
    const rawRecords = await this.conversationCsvSourcePort.readFromFolder(folderPath);

    return rawRecords.map((record) => {
      const rawMessage = this.conversationCsvRecordTranslatorService.translate(record);
      this.logger.log(JSON.stringify(this.conversationCsvRecordTranslatorService.buildLogPayload(rawMessage)));
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
    semanticChunks: SemanticConversationChunk[]
  ): Promise<number[][] | null> {
    if (!this.embeddingStageReady) {
      this.logger.log('Embedding stage planned. Waiting for finalized cleaning rules.');
      return null;
    }

    if (!this.ingestionRuntimeConfigPort.isQdrantIngestionEnabled()) {
      this.logger.log('Embedding stage disabled by configuration.');
      return null;
    }

    if (semanticChunks.length === 0) {
      return [];
    }

    const embeddings = await this.embeddingGeneratorPort.generateEmbeddings(
      semanticChunks.map((chunk) => chunk.content)
    );

    if (embeddings.length !== semanticChunks.length) {
      throw new Error('Embedding generator returned an unexpected number of vectors.');
    }

    return embeddings;
  }

  private async runStorageStage(
    semanticChunks: SemanticConversationChunk[],
    embeddings: number[][] | null
  ): Promise<number> {
    if (!embeddings) {
      this.logger.log('Storage stage planned. Waiting for embedding stage activation.');
      return 0;
    }

    if (semanticChunks.length === 0) {
      return 0;
    }

    await this.vectorStorePort.ensureCollection(this.embeddingGeneratorPort.getDimensions());

    const points: VectorPoint[] = semanticChunks.map((semanticChunk, index) => {
      const vector = embeddings[index];

      if (!vector) {
        throw new Error(`Missing vector for semantic chunk index ${index}.`);
      }

      return {
        id: this.buildPointId(semanticChunk, index),
        vector,
        payload: {
          chunkId: semanticChunk.chunkId,
          turnId: semanticChunk.turnId,
          conversationId: semanticChunk.conversationId,
          sourceFile: semanticChunk.sourceFile,
          content: semanticChunk.content,
          metadata: semanticChunk.metadata
        }
      };
    });

    await this.vectorStorePort.upsert(points);

    this.logger.log(`Stored ${points.length} semantic chunks in vector storage.`);

    return points.length;
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
