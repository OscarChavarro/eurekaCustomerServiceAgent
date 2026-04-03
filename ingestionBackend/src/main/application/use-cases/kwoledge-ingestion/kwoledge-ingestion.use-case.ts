import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IngestionRuntimeConfigPort } from '../../ports/config/ingestion-runtime-config.port';
import type { ConversationCsvSourcePort } from '../../ports/inbound/conversation-csv-source.port';
import type { EmbeddingGeneratorPort } from '../../ports/outbound/embedding-generator.port';
import type { VectorPoint, VectorStorePort } from '../../ports/outbound/vector-store.port';
import { TOKENS } from '../../ports/tokens';
import { ConversationCsvRecordTranslatorService } from './conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './conversation-message-cleaning.service';
import type { KwoledgeIngestionCommand } from './kwoledge-ingestion.command';
import {
  MessageDirection
} from './kwoledge-ingestion-message.model';
import type { KwoledgeIngestionMessage } from './kwoledge-ingestion-message.model';
import {
  KwoledgeIngestionLimits,
  KwoledgeIngestionMessagesBreakdown,
  KwoledgeIngestionResult
} from './kwoledge-ingestion.result';

@Injectable()
export class KwoledgeIngestionUseCase {
  private readonly logger = new Logger(KwoledgeIngestionUseCase.name);

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
    private readonly conversationMessageCleaningService: ConversationMessageCleaningService
  ) {}

  public async execute(command: KwoledgeIngestionCommand): Promise<KwoledgeIngestionResult> {
    const rawRecords = await this.conversationCsvSourcePort.readFromFolder(
      command.folderPath
    );
    const conversationMessages = rawRecords.map((record) => {
      const translatedRecord = this.conversationCsvRecordTranslatorService.translate(record);

      this.logger.log(
        JSON.stringify(this.conversationCsvRecordTranslatorService.buildLogPayload(translatedRecord))
      );

      return translatedRecord;
    });

    const cleanedMessages = this.conversationMessageCleaningService.clean(conversationMessages);
    const indexableMessages = cleanedMessages.filter((message) => message.text.trim().length > 0);
    const uniqueFiles = new Set(cleanedMessages.map((message) => message.sourceFile));
    const messagesBreakdown = this.buildMessagesBreakdown(cleanedMessages);
    const limits = this.buildLimits(cleanedMessages);

    if (indexableMessages.length === 0) {
      this.logger.warn(`No indexable messages found in folder ${command.folderPath}.`);
      return new KwoledgeIngestionResult(
        command.folderPath,
        uniqueFiles.size,
        0,
        cleanedMessages.length,
        messagesBreakdown,
        limits
      );
    }

    if (!this.conversationMessageCleaningService.isReadyForEmbeddingIngestion()) {
      this.logger.log(
        'Message cleaning is pending. Skipping embedding generation and vector storage.'
      );

      const skippedMessages = cleanedMessages.length - indexableMessages.length;

      return new KwoledgeIngestionResult(
        command.folderPath,
        uniqueFiles.size,
        0,
        skippedMessages,
        messagesBreakdown,
        limits
      );
    }

    if (!this.ingestionRuntimeConfigPort.isQdrantIngestionEnabled()) {
      this.logger.log(
        'Qdrant ingestion is disabled by configuration. Skipping embedding generation and vector storage.'
      );

      const skippedMessages = cleanedMessages.length - indexableMessages.length;

      return new KwoledgeIngestionResult(
        command.folderPath,
        uniqueFiles.size,
        0,
        skippedMessages,
        messagesBreakdown,
        limits
      );
    }

    const embeddings = await this.embeddingGeneratorPort.generateEmbeddings(
      indexableMessages.map((message) => message.text)
    );

    if (embeddings.length !== indexableMessages.length) {
      throw new Error('Embedding generator returned an unexpected number of vectors.');
    }

    await this.vectorStorePort.ensureCollection(this.embeddingGeneratorPort.getDimensions());

    const points: VectorPoint[] = indexableMessages.map((message, index) => {
      const vector = embeddings[index];

      if (!vector) {
        throw new Error(`Missing vector for message index ${index}.`);
      }

      return {
        id: this.buildPointId(message, index),
        vector,
        payload: {
          conversationId: message.conversationId,
          externalId: message.externalId,
          sentAt: message.sentAt?.toISOString() ?? null,
          sender: message.sender,
          direction: message.direction,
          text: message.text,
          sourceFile: message.sourceFile,
          rowNumber: message.rowNumber,
          normalizedFields: message.normalizedFields
        }
      };
    });

    await this.vectorStorePort.upsert(points);

    const skippedMessages = cleanedMessages.length - indexableMessages.length;

    this.logger.log(
      `Indexed ${indexableMessages.length} messages from ${uniqueFiles.size} csv files in ${command.folderPath}.`
    );

    return new KwoledgeIngestionResult(
      command.folderPath,
      uniqueFiles.size,
      indexableMessages.length,
      skippedMessages,
      messagesBreakdown,
      limits
    );
  }

  private buildMessagesBreakdown(
    messages: KwoledgeIngestionMessage[]
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

  private buildLimits(messages: KwoledgeIngestionMessage[]): KwoledgeIngestionLimits {
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

  private hasAssociatedMedia(message: KwoledgeIngestionMessage): boolean {
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

  private buildPointId(message: KwoledgeIngestionMessage, index: number): string {
    const hash = createHash('sha256')
      .update(`${message.conversationId}|${message.externalId}|${message.text}|${index}`)
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
