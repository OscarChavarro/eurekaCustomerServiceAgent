import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IngestionRuntimeConfigPort } from '../../ports/config/ingestion-runtime-config.port';
import type { ConversationCsvSourcePort } from '../../ports/inbound/conversation-csv-source.port';
import type {
  ConversationsRepositoryPort,
  RawConversationStageMessage
} from '../../ports/outbound/conversations-repository.port';
import type { EmbeddingPort } from '../../ports/outbound/embedding.port';
import type {
  EmbeddingRepositoryRecord,
  EmbeddingsRepositoryPort
} from '../../ports/outbound/embeddings-repository.port';
import type { ProcessedConversationStageStorePort } from '../../ports/outbound/processed-conversation-stage-store.port';
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
  chunkIndex: number;
  vector: number[];
  payload: EmbeddingChunkPayload;
};

type StageDirection = 'customer_to_agent' | 'agent_to_customer';
type RawStageDirection = StageDirection | 'whatsapAuto';

type RawStageMessage = {
  externalId: string;
  sentAt: string | null;
  sender: string | null;
  text: string;
  sourceFile: string;
  rowNumber: number;
  direction: RawStageDirection;
  normalizedFields: Record<string, unknown>;
};

type CleanedStageMessage = {
  externalId: string;
  direction: RawStageDirection;
  text: string;
};

type StructuredStageMessage = {
  turnId: string;
  question: string;
  answer: string;
  messageIds: string[];
};

type ChunkStageMessage = {
  chunkId: string;
  chunkMessage: string;
  messageIds: string[];
};

type EmbedStageMessage = {
  chunkId: string;
  vector: number[];
};

type ProcessedConversationStages = {
  conversationId: string;
  rawMessages: RawStageMessage[];
  cleanedMessages: CleanedStageMessage[];
  structuredMessages: StructuredStageMessage[];
  chunks: ChunkStageMessage[];
  embed: EmbedStageMessage[];
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
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort,
    @Inject(TOKENS.EmbeddingsRepositoryPort)
    private readonly embeddingsRepositoryPort: EmbeddingsRepositoryPort,
    @Inject(TOKENS.ProcessedConversationStageStorePort)
    private readonly processedConversationStageStorePort: ProcessedConversationStageStorePort,
    @Inject(TOKENS.IngestionRuntimeConfigPort)
    private readonly ingestionRuntimeConfigPort: IngestionRuntimeConfigPort,
    private readonly conversationCsvRecordTranslatorService: ConversationCsvRecordTranslatorService,
    private readonly conversationMessageCleaningService: ConversationMessageCleaningService,
    private readonly conversationStructuringService: ConversationStructuringService,
    private readonly conversationChunkingService: ConversationChunkingService
  ) {}

  public async execute(command: KwoledgeIngestionCommand): Promise<KwoledgeIngestionResult> {
    const rawMessages = await this.loadRawMessages(command.folderPath);
    const rawByConversation = this.groupByConversationId(rawMessages, (message) => message.conversationId);
    const orderedConversationIds = Array.from(rawByConversation.keys()).sort((left, right) =>
      left.localeCompare(right)
    );
    const totalConversations = orderedConversationIds.length;
    const uniqueFiles = new Set(rawMessages.map((message) => message.sourceFile));

    const allCleanedMessages: CleanedConversationMessage[] = [];
    const allSemanticChunks: SemanticConversationChunk[] = [];
    const allEmbeddedChunks: EmbeddedChunk[] = [];
    let skippedMessages = 0;

    for (const [index, conversationId] of orderedConversationIds.entries()) {
      const currentPosition = index + 1;
      const conversationRawMessages = rawByConversation.get(conversationId) ?? [];

      const rawStageMessages = conversationRawMessages.map((message) =>
        this.toRepositoryRawStageMessage(message)
      );
      await this.conversationsRepositoryPort.upsertRawMessages(
        conversationId,
        rawStageMessages,
        this.buildConversationMetadata(conversationRawMessages)
      );
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'raw');

      const conversationCleanedMessages = this.runCleaningStage(conversationRawMessages);
      allCleanedMessages.push(...conversationCleanedMessages);
      skippedMessages += conversationCleanedMessages.filter(
        (message) => message.cleanedText.length === 0
      ).length;
      await this.conversationsRepositoryPort.upsertCleanedMessages(
        conversationId,
        conversationCleanedMessages.map((message) => this.toCleanedStageMessage(message))
      );
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'clean');

      const conversationStructuredTurns = this.runStructuringStage(conversationCleanedMessages);
      await this.conversationsRepositoryPort.upsertStructuredMessages(
        conversationId,
        conversationStructuredTurns.map((turn) => this.toStructuredStageMessage(turn))
      );
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'structure');

      const conversationSemanticChunks = this.runChunkingStage(conversationStructuredTurns);
      allSemanticChunks.push(...conversationSemanticChunks);
      await this.conversationsRepositoryPort.upsertChunkedMessages(
        conversationId,
        conversationSemanticChunks.map((chunk) => this.toChunkStageMessage(chunk))
      );
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'chunk');

      const conversationEmbeddedChunks = await this.runEmbeddingStage(
        conversationRawMessages,
        conversationSemanticChunks
      );
      allEmbeddedChunks.push(...conversationEmbeddedChunks);
      await this.persistEmbeddings(conversationEmbeddedChunks);
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'embed');

      await this.persistProcessedConversation(
        conversationId,
        conversationRawMessages,
        conversationCleanedMessages,
        conversationStructuredTurns,
        conversationSemanticChunks,
        conversationEmbeddedChunks
      );
    }

    if (allSemanticChunks.length === 0) {
      this.logger.warn(`No semantic chunks found in folder ${command.folderPath}.`);
    }

    const indexedChunks = await this.runStorageStage(allEmbeddedChunks);
    const messagesBreakdown = this.buildMessagesBreakdown(allCleanedMessages);
    const limits = this.buildLimits(allCleanedMessages);

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
      return [];
    }

    const rawMessagesByExternalId = this.buildRawMessagesIndex(rawMessages);
    const embeddedChunks: EmbeddedChunk[] = [];

    for (const [chunkIndex, chunk] of semanticChunks.entries()) {
      const payload = this.buildEmbeddingPayload(chunk, rawMessagesByExternalId);
      const vector = await this.embeddingPort.generateEmbedding(payload.chunkMessage);
      embeddedChunks.push({
        semanticChunk: chunk,
        chunkIndex,
        vector,
        payload
      });
    }

    return embeddedChunks;
  }

  private async runStorageStage(embeddedChunks: EmbeddedChunk[]): Promise<number> {
    if (!this.ingestionRuntimeConfigPort.isQdrantIngestionEnabled()) {
      return 0;
    }

    if (embeddedChunks.length === 0) {
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

    await this.vectorStorePort.upsert(points);

    this.logger.log(`Stored ${points.length} semantic chunks in vector storage.`);

    return points.length;
  }

  private async persistProcessedConversation(
    conversationId: string,
    rawMessages: RawConversationMessage[],
    cleanedMessages: CleanedConversationMessage[],
    structuredTurns: StructuredConversationTurn[],
    semanticChunks: SemanticConversationChunk[],
    embeddedChunks: EmbeddedChunk[]
  ): Promise<void> {
    const stages = this.buildProcessedConversationStages(
      conversationId,
      rawMessages,
      cleanedMessages,
      structuredTurns,
      semanticChunks,
      embeddedChunks
    );

    await this.processedConversationStageStorePort.saveConversationStages(conversationId, stages);
  }

  private buildProcessedConversationStages(
    conversationId: string,
    rawMessages: RawConversationMessage[],
    cleanedMessages: CleanedConversationMessage[],
    structuredTurns: StructuredConversationTurn[],
    semanticChunks: SemanticConversationChunk[],
    embeddedChunks: EmbeddedChunk[]
  ): ProcessedConversationStages {
    return {
      conversationId,
      rawMessages: rawMessages.map((message) => this.toRawStageMessage(message)),
      cleanedMessages: cleanedMessages.map((message) => this.toCleanedStageMessage(message)),
      structuredMessages: structuredTurns.map((turn) => this.toStructuredStageMessage(turn)),
      chunks: semanticChunks.map((chunk) => this.toChunkStageMessage(chunk)),
      embed: embeddedChunks.map((embeddedChunk) => ({
        chunkId: embeddedChunk.semanticChunk.chunkId,
        vector: embeddedChunk.vector
      }))
    };
  }

  private async persistEmbeddings(embeddedChunks: EmbeddedChunk[]): Promise<void> {
    if (embeddedChunks.length === 0) {
      return;
    }

    const records = embeddedChunks.map((embeddedChunk) => this.toEmbeddingRepositoryRecord(embeddedChunk));
    await this.embeddingsRepositoryPort.upsertEmbeddings(records);
  }

  private logConversationPhase(
    currentPosition: number,
    totalConversations: number,
    conversationId: string,
    phase: string
  ): void {
    this.logger.log(`[${currentPosition}/${totalConversations}] ${conversationId} - ${phase}`);
  }

  private groupByConversationId<T>(
    items: T[],
    conversationIdSelector: (item: T) => string
  ): Map<string, T[]> {
    const grouped = new Map<string, T[]>();

    for (const item of items) {
      const conversationId = conversationIdSelector(item);
      const current = grouped.get(conversationId) ?? [];
      current.push(item);
      grouped.set(conversationId, current);
    }

    return grouped;
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
      normalizedFields: this.omitTextFromNormalizedFields(rawMessage.normalizedFields)
    };
  }

  private toEmbeddingRepositoryRecord(embeddedChunk: EmbeddedChunk): EmbeddingRepositoryRecord {
    return {
      embeddingId: this.buildEmbeddingId(
        embeddedChunk.semanticChunk.conversationId,
        embeddedChunk.chunkIndex
      ),
      conversationId: embeddedChunk.semanticChunk.conversationId,
      chunkIndex: embeddedChunk.chunkIndex,
      chunkId: embeddedChunk.semanticChunk.chunkId,
      text: embeddedChunk.semanticChunk.content,
      vector: embeddedChunk.vector,
      createdAt: new Date()
    };
  }

  private buildConversationMetadata(rawMessages: RawConversationMessage[]): {
    createdAt: Date;
    source: string;
    firstMessageDate: string | null;
    lastMessageDate: string | null;
    lastMessageText: string | null;
  } {
    const firstRawMessage = rawMessages[0];
    const lastRawMessage = rawMessages[rawMessages.length - 1];
    const firstMessageDate = firstRawMessage?.sentAt?.toISOString() ?? null;
    const lastMessageDate = lastRawMessage?.sentAt?.toISOString() ?? null;

    return {
      createdAt: new Date(),
      source: rawMessages[0]?.sourceFile ?? 'unknown',
      firstMessageDate,
      lastMessageDate,
      lastMessageText: lastRawMessage?.normalizedFields.text ?? null
    };
  }

  private toRawStageMessage(rawMessage: RawConversationMessage): RawStageMessage {
    return {
      externalId: rawMessage.externalId,
      sentAt: rawMessage.sentAt?.toISOString() ?? null,
      sender: rawMessage.sender,
      text: rawMessage.text,
      sourceFile: rawMessage.sourceFile,
      rowNumber: rawMessage.rowNumber,
      direction: this.toStageDirection(rawMessage.direction),
      normalizedFields: this.omitTextFromNormalizedFields(rawMessage.normalizedFields)
    };
  }

  private toRepositoryRawStageMessage(
    rawMessage: RawConversationMessage
  ): RawConversationStageMessage {
    return {
      externalId: rawMessage.externalId,
      sentAt: rawMessage.sentAt?.toISOString() ?? null,
      sender: rawMessage.sender,
      text: rawMessage.text,
      rowNumber: rawMessage.rowNumber,
      direction: this.toStageDirection(rawMessage.direction),
      normalizedFields: this.omitTextFromNormalizedFields(rawMessage.normalizedFields)
    };
  }

  private omitTextFromNormalizedFields(
    normalizedFields: RawConversationMessage['normalizedFields']
  ): Record<string, unknown> {
    const { text: _unusedText, ...remainingFields } =
      normalizedFields as unknown as Record<string, unknown>;
    return remainingFields;
  }

  private toCleanedStageMessage(message: CleanedConversationMessage): CleanedStageMessage {
    return {
      externalId: message.externalId,
      direction: this.toStageDirection(message.direction),
      text: message.cleanedText
    };
  }

  private toStructuredStageMessage(turn: StructuredConversationTurn): StructuredStageMessage {
    return {
      turnId: turn.turnId,
      question: turn.question,
      answer: turn.answer,
      messageIds: turn.messageIds
    };
  }

  private toChunkStageMessage(chunk: SemanticConversationChunk): ChunkStageMessage {
    return {
      chunkId: chunk.chunkId,
      chunkMessage: chunk.content,
      messageIds: this.extractChunkMessageIds(chunk)
    };
  }

  private toStageDirection(direction: MessageDirection): RawStageDirection {
    if (direction === MessageDirection.Outgoing) {
      return 'agent_to_customer';
    }

    if (direction === MessageDirection.Incoming) {
      return 'customer_to_agent';
    }

    return 'whatsapAuto';
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

  private buildEmbeddingId(conversationId: string, chunkIndex: number): string {
    const hash = createHash('sha256')
      .update(`${conversationId}|${chunkIndex}`)
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
