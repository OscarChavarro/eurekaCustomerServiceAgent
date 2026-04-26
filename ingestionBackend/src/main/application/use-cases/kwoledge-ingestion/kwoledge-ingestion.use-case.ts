import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ConversationCsvSourcePort } from '../../ports/inbound/conversation-csv-source.port';
import type {
  ConversationsRepositoryPort,
  NormalizedConversationStageMessage,
  RawMessageAudioNormalizedFieldsPatch,
  RawConversationAudioDetails,
  RawConversationStageMessage
} from '../../ports/outbound/conversations-repository.port';
import type { EmbeddingPort } from '../../ports/outbound/embedding.port';
import type {
  EmbeddingRepositoryRecord,
  EmbeddingsRepositoryPort
} from '../../ports/outbound/embeddings-repository.port';
import type { FailedAudioResourceLogPort } from '../../ports/outbound/failed-audio-resource-log.port';
import type { ProcessedConversationStageStorePort } from '../../ports/outbound/processed-conversation-stage-store.port';
import type { VectorPoint, VectorStorePort } from '../../ports/outbound/vector-store.port';
import {
  RawAudioTranscriptionCandidate,
  RawAudioTranscriptionOrchestratorService
} from '../../services/raw-audio-transcription-orchestrator.service';
import { TOKENS } from '../../ports/tokens';
import { ConversationChunkingService } from './conversation-chunking.service';
import { ConversationCsvRecordTranslatorService } from './conversation-csv-record-translator.service';
import { ConversationMediaNormalizationService } from './conversation-media-normalization.service';
import { ConversationMessageCleaningService } from './conversation-message-cleaning.service';
import { ConversationStructuringService } from './conversation-structuring.service';
import type { KwoledgeIngestionCommand } from './kwoledge-ingestion.command';
import {
  CleanedConversationMessage,
  MessageDirection,
  NormalizedConversationCsvFields,
  RawConversationMessage,
  StructuredConversationTurn,
  SemanticConversationChunk
} from './kwoledge-ingestion-message.model';
import {
  KwoledgeIngestionAudio,
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
  conversationId: string;
  chunkId: string;
  messageIds: string[];
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
  contactName: string | null;
  rawMessages: RawStageMessage[];
  normalizedMessages: RawStageMessage[];
  cleanedMessages: CleanedStageMessage[];
  structuredMessages: StructuredStageMessage[];
  chunks: ChunkStageMessage[];
  embed: EmbedStageMessage[];
};

type RawConversationMergeResult = {
  messages: RawConversationStageMessage[];
  newMessages: number;
  firstNewMessageExternalId: string | null;
  orderBroken: boolean;
  requiresRebuild: boolean;
};

@Injectable()
export class KwoledgeIngestionUseCase {
  private readonly logger = new Logger(KwoledgeIngestionUseCase.name);
  private static readonly COMPLETION_BANNER =
    '========================= INGESTION PROCESS COMPLETED ==========================';
  private static readonly OUTPUT_DIRECTORY = resolve(process.cwd(), 'output');
  private static readonly UNCHANGED_LOG_PATH = resolve(
    KwoledgeIngestionUseCase.OUTPUT_DIRECTORY,
    'unchanged.log'
  );
  private static readonly UPDATED_LOG_PATH = resolve(
    KwoledgeIngestionUseCase.OUTPUT_DIRECTORY,
    'updated.log'
  );

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
    @Inject(TOKENS.FailedAudioResourceLogPort)
    private readonly failedAudioResourceLogPort: FailedAudioResourceLogPort,
    @Inject(TOKENS.ProcessedConversationStageStorePort)
    private readonly processedConversationStageStorePort: ProcessedConversationStageStorePort,
    private readonly conversationCsvRecordTranslatorService: ConversationCsvRecordTranslatorService,
    private readonly conversationMediaNormalizationService: ConversationMediaNormalizationService,
    private readonly conversationMessageCleaningService: ConversationMessageCleaningService,
    private readonly conversationStructuringService: ConversationStructuringService,
    private readonly conversationChunkingService: ConversationChunkingService,
    private readonly rawAudioTranscriptionOrchestratorService: RawAudioTranscriptionOrchestratorService
  ) {}

  public async execute(command: KwoledgeIngestionCommand): Promise<KwoledgeIngestionResult> {
    await this.failedAudioResourceLogPort.resetLog();
    await this.resetConversationChangeLogs();
    const rawMessages = await this.loadRawMessages(command.folderPath);
    const rawByConversation = this.groupByConversationId(rawMessages, (message) => message.conversationId);
    const orderedConversationIds = Array.from(rawByConversation.keys()).sort((left, right) =>
      left.localeCompare(right)
    );
    const totalConversations = orderedConversationIds.length;
    const uniqueFiles = new Set(rawMessages.map((message) => message.sourceFile));

    const allCleanedMessages: CleanedConversationMessage[] = [];
    const allSemanticChunks: SemanticConversationChunk[] = [];
    let totalIndexedChunks = 0;
    let skippedMessages = 0;
    let importedAudioMessages = 0;
    let noiseAudioMessages = 0;
    let processedConversations = 0;

    for (const [index, conversationId] of orderedConversationIds.entries()) {
      const currentPosition = index + 1;
      const incomingRawMessages = rawByConversation.get(conversationId) ?? [];
      const incomingRawStageMessages = incomingRawMessages.map((message) =>
        this.toRepositoryRawStageMessage(message)
      );
      const existingSnapshot =
        await this.conversationsRepositoryPort.findConversationSnapshot(conversationId);
      const mergeResult = this.mergeRawConversationMessages(
        conversationId,
        existingSnapshot?.rawMessages ?? [],
        incomingRawStageMessages
      );
      const mergedRawStageMessages = mergeResult.messages;
      const sourceRawMessages = this.buildSourceRawMessagesForMergedConversation(
        conversationId,
        incomingRawMessages,
        mergedRawStageMessages,
        existingSnapshot?.sourceFile ?? incomingRawMessages[0]?.sourceFile ?? 'unknown',
        existingSnapshot?.filePattern ?? this.resolveConversationFilePattern(incomingRawMessages),
        existingSnapshot?.contactName ?? this.resolveConversationContactName(incomingRawMessages)
      );
      const conversationMetadata = this.buildConversationMetadata(sourceRawMessages);

      await this.conversationsRepositoryPort.upsertRawMessages(
        conversationId,
        mergedRawStageMessages,
        conversationMetadata
      );
      this.logConversationPhase(
        currentPosition,
        totalConversations,
        conversationId,
        `raw (new=${mergeResult.newMessages}, merged=${mergedRawStageMessages.length}, orderBroken=${mergeResult.orderBroken ? 'yes' : 'no'})`
      );

      if (!mergeResult.requiresRebuild) {
        await this.appendUnchangedConversationLog(conversationId);
        this.logConversationPhase(
          currentPosition,
          totalConversations,
          conversationId,
          'skip (no changes detected)'
        );
        continue;
      }
      processedConversations += 1;
      await this.appendUpdatedConversationLog(
        conversationId,
        mergeResult.newMessages,
        mergeResult.firstNewMessageExternalId
      );

      const normalizedStage = await this.runNormalizationStage(
        conversationId,
        mergedRawStageMessages
      );
      const normalizedMessagesWithRecoveredAudioDetails =
        this.applyExistingAudioDetailsToNormalizedMessages(
          normalizedStage.messages,
          mergedRawStageMessages
        );
      const pendingAudioTranscriptionCandidates = this.toRawAudioTranscriptionCandidates(
        conversationId,
        normalizedMessagesWithRecoveredAudioDetails.filter(
          (normalizedMessage) => normalizedMessage.audioDetails === undefined
        ),
        conversationMetadata.filePattern
      );
      const transcriptionStage =
        await this.rawAudioTranscriptionOrchestratorService.processManyBlockingDetailed(
          pendingAudioTranscriptionCandidates
        );
      const preservedAudioProcessedMessages = normalizedMessagesWithRecoveredAudioDetails
        .filter((normalizedMessage) => normalizedMessage.audioDetails !== undefined)
        .map((normalizedMessage) => ({
          rawMessageExternalId: normalizedMessage.externalId,
          audioDetails: normalizedMessage.audioDetails as RawConversationAudioDetails
        }));
      const normalizedMessagesWithAudioText = this.applyAudioTranscriptionsToNormalizedMessages(
        normalizedMessagesWithRecoveredAudioDetails,
        [...preservedAudioProcessedMessages, ...transcriptionStage.processed]
      );
      await this.persistNormalizedAudioFieldRepairsToRawMessages(
        conversationId,
        mergedRawStageMessages,
        normalizedMessagesWithAudioText
      );
      importedAudioMessages += transcriptionStage.importedSuccessfully;
      noiseAudioMessages += transcriptionStage.noise;
      const normalizedPipelineMessages = this.toPipelineRawMessages(
        conversationId,
        sourceRawMessages,
        normalizedMessagesWithAudioText
      );
      const conversationCleanedMessages = this.runCleaningStage(normalizedPipelineMessages);
      allCleanedMessages.push(...conversationCleanedMessages);
      skippedMessages += conversationCleanedMessages.filter(
        (message) => message.cleanedText.length === 0
      ).length;
      await this.conversationsRepositoryPort.upsertCleanedMessages(
        conversationId,
        conversationCleanedMessages.map((message) => this.toCleanedStageMessage(message))
      );
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'clean');

      await this.conversationsRepositoryPort.upsertNormalizedMessages(
        conversationId,
        normalizedMessagesWithAudioText
      );
      this.logConversationPhase(
        currentPosition,
        totalConversations,
        conversationId,
        `normalize (${normalizedStage.normalizedCount} updated, ${normalizedStage.missingCount} missing, ${transcriptionStage.importedSuccessfully} audio ok, ${transcriptionStage.noise} audio noise)`
      );

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

      const existingEmbeddings =
        await this.embeddingsRepositoryPort.findEmbeddingsByConversationId(conversationId);
      const conversationEmbeddedChunks = await this.runEmbeddingStage(
        normalizedPipelineMessages,
        conversationSemanticChunks,
        existingEmbeddings
      );
      await this.embeddingsRepositoryPort.deleteEmbeddingsByConversationId(conversationId);
      await this.persistEmbeddings(conversationEmbeddedChunks);
      this.logConversationPhase(currentPosition, totalConversations, conversationId, 'embed');

      await this.vectorStorePort.deletePointsByConversationId(conversationId);
      const indexedChunks = await this.runStorageStage(conversationEmbeddedChunks);
      totalIndexedChunks += indexedChunks;
      this.logConversationPhase(
        currentPosition,
        totalConversations,
        conversationId,
        `store (${indexedChunks} points)`
      );

      await this.persistProcessedConversation(
        conversationId,
        sourceRawMessages,
        normalizedMessagesWithAudioText,
        conversationCleanedMessages,
        conversationStructuredTurns,
        conversationSemanticChunks,
        conversationEmbeddedChunks
      );
    }

    if (processedConversations > 0 && allSemanticChunks.length === 0) {
      this.logger.warn(`No semantic chunks found in folder ${command.folderPath}.`);
    }

    const messagesBreakdown = this.buildMessagesBreakdown(allCleanedMessages);
    const limits = this.buildLimits(allCleanedMessages);
    this.logger.log(KwoledgeIngestionUseCase.COMPLETION_BANNER);

    return new KwoledgeIngestionResult(
      command.folderPath,
      uniqueFiles.size,
      totalIndexedChunks,
      skippedMessages,
      messagesBreakdown,
      limits,
      new KwoledgeIngestionAudio(importedAudioMessages, noiseAudioMessages)
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

  private async runNormalizationStage(
    conversationId: string,
    rawStageMessages: RawConversationStageMessage[]
  ): Promise<{
    messages: NormalizedConversationStageMessage[];
    normalizedCount: number;
    missingCount: number;
  }> {
    return this.conversationMediaNormalizationService.normalizeConversation(
      conversationId,
      rawStageMessages
    );
  }

  private buildSourceRawMessagesForMergedConversation(
    conversationId: string,
    incomingRawMessages: RawConversationMessage[],
    mergedRawStageMessages: RawConversationStageMessage[],
    fallbackSourceFile: string,
    filePattern: string | null,
    contactName: string | null
  ): RawConversationMessage[] {
    const incomingByExternalId = new Map(
      incomingRawMessages.map((incomingRawMessage) => [incomingRawMessage.externalId, incomingRawMessage])
    );

    return mergedRawStageMessages.map((mergedRawStageMessage) => {
      const incomingRawMessage = incomingByExternalId.get(mergedRawStageMessage.externalId);
      if (incomingRawMessage) {
        return incomingRawMessage;
      }

      const parsedSentAt =
        mergedRawStageMessage.sentAt !== null ? new Date(mergedRawStageMessage.sentAt) : null;
      const hasValidSentAt = parsedSentAt !== null && !Number.isNaN(parsedSentAt.getTime());

      return new RawConversationMessage(
        conversationId,
        contactName,
        mergedRawStageMessage.externalId,
        hasValidSentAt ? parsedSentAt : null,
        mergedRawStageMessage.sender,
        mergedRawStageMessage.text,
        fallbackSourceFile,
        filePattern,
        mergedRawStageMessage.rowNumber,
        this.toMessageDirection(mergedRawStageMessage.direction),
        this.toNormalizedConversationCsvFields(mergedRawStageMessage.normalizedFields)
      );
    });
  }

  private mergeRawConversationMessages(
    conversationId: string,
    existingMessages: RawConversationStageMessage[],
    incomingMessages: RawConversationStageMessage[]
  ): RawConversationMergeResult {
    if (existingMessages.length === 0) {
      return {
        messages: incomingMessages,
        newMessages: incomingMessages.length,
        firstNewMessageExternalId: incomingMessages[0]?.externalId ?? null,
        orderBroken: false,
        requiresRebuild: incomingMessages.length > 0
      };
    }

    if (incomingMessages.length === 0) {
      return {
        messages: existingMessages,
        newMessages: 0,
        firstNewMessageExternalId: null,
        orderBroken: false,
        requiresRebuild: false
      };
    }

    const mergedMessages: RawConversationStageMessage[] = [...existingMessages];
    let existingCursor = 0;
    let newMessages = 0;
    let firstNewMessageExternalId: string | null = null;
    let orderBroken = false;

    for (const incomingMessage of incomingMessages) {
      const equivalentIndex = this.findEquivalentRawMessageIndex(
        existingMessages,
        incomingMessage,
        existingCursor
      );

      if (equivalentIndex !== -1) {
        existingCursor = equivalentIndex + 1;
        continue;
      }

      newMessages += 1;
      if (existingCursor < existingMessages.length) {
        orderBroken = true;
      }

      const uniqueIncomingMessage = this.ensureUniqueExternalId(
        conversationId,
        incomingMessage,
        mergedMessages
      );
      if (firstNewMessageExternalId === null) {
        firstNewMessageExternalId = uniqueIncomingMessage.externalId;
      }
      mergedMessages.push(uniqueIncomingMessage);
    }

    const sortedMergedMessages = this.sortRawStageMessages(mergedMessages);
    const requiresRebuild = newMessages > 0 || orderBroken;

    return {
      messages: sortedMergedMessages,
      newMessages,
      firstNewMessageExternalId,
      orderBroken,
      requiresRebuild
    };
  }

  private async resetConversationChangeLogs(): Promise<void> {
    await mkdir(KwoledgeIngestionUseCase.OUTPUT_DIRECTORY, { recursive: true });
    await Promise.all([
      writeFile(KwoledgeIngestionUseCase.UNCHANGED_LOG_PATH, ''),
      writeFile(KwoledgeIngestionUseCase.UPDATED_LOG_PATH, '')
    ]);
  }

  private async appendUnchangedConversationLog(conversationId: string): Promise<void> {
    await appendFile(KwoledgeIngestionUseCase.UNCHANGED_LOG_PATH, `${conversationId}\n`);
  }

  private async appendUpdatedConversationLog(
    conversationId: string,
    newMessages: number,
    firstNewRawMessageId: string | null
  ): Promise<void> {
    const firstRawMessageId = firstNewRawMessageId ?? 'none';
    await appendFile(
      KwoledgeIngestionUseCase.UPDATED_LOG_PATH,
      `${conversationId} ${newMessages} ${firstRawMessageId}\n`
    );
  }

  private applyExistingAudioDetailsToNormalizedMessages(
    normalizedMessages: NormalizedConversationStageMessage[],
    rawMessages: RawConversationStageMessage[]
  ): NormalizedConversationStageMessage[] {
    const audioDetailsByExternalId = new Map(
      rawMessages
        .filter((rawMessage) => rawMessage.audioDetails !== undefined)
        .map((rawMessage) => [rawMessage.externalId, rawMessage.audioDetails as RawConversationAudioDetails])
    );

    return normalizedMessages.map((normalizedMessage) => ({
      ...normalizedMessage,
      audioDetails:
        normalizedMessage.audioDetails ?? audioDetailsByExternalId.get(normalizedMessage.externalId)
    }));
  }

  private applyAudioTranscriptionsToNormalizedMessages(
    normalizedMessages: NormalizedConversationStageMessage[],
    processedAudioMessages: Array<{
      rawMessageExternalId: string;
      audioDetails: RawConversationAudioDetails;
    }>
  ): NormalizedConversationStageMessage[] {
    const audioDetailsByMessageId = new Map(
      processedAudioMessages.map((processedAudioMessage) => [
        processedAudioMessage.rawMessageExternalId,
        processedAudioMessage.audioDetails
      ])
    );

    return normalizedMessages.map((normalizedMessage) => {
      const audioDetails = audioDetailsByMessageId.get(normalizedMessage.externalId);
      if (!audioDetails) {
        return normalizedMessage;
      }

      const currentText = normalizedMessage.text.trim();
      const transcriptionText =
        audioDetails.type === 'noise' ? '' : audioDetails.transcription.trim();

      return {
        ...normalizedMessage,
        text: currentText.length > 0 ? currentText : transcriptionText,
        audioDetails
      };
    });
  }

  private toPipelineRawMessages(
    conversationId: string,
    sourceRawMessages: RawConversationMessage[],
    normalizedMessages: NormalizedConversationStageMessage[]
  ): RawConversationMessage[] {
    const sourceRawMessagesByExternalId = new Map(
      sourceRawMessages.map((sourceRawMessage) => [sourceRawMessage.externalId, sourceRawMessage])
    );

    return normalizedMessages.map((normalizedMessage) => {
      const sourceRawMessage = sourceRawMessagesByExternalId.get(normalizedMessage.externalId);
      const sentAt =
        normalizedMessage.sentAt !== null
          ? new Date(normalizedMessage.sentAt)
          : sourceRawMessage?.sentAt ?? null;
      const hasValidSentAt = sentAt !== null && !Number.isNaN(sentAt.getTime());

      return new RawConversationMessage(
        sourceRawMessage?.conversationId ?? conversationId,
        sourceRawMessage?.contactName ?? null,
        normalizedMessage.externalId,
        hasValidSentAt ? sentAt : null,
        normalizedMessage.sender,
        normalizedMessage.text,
        sourceRawMessage?.sourceFile ?? 'unknown',
        sourceRawMessage?.filePattern ?? null,
        normalizedMessage.rowNumber,
        this.toMessageDirection(normalizedMessage.direction),
        this.toNormalizedConversationCsvFields(normalizedMessage.normalizedFields)
      );
    });
  }

  private toNormalizedConversationCsvFields(
    normalizedFields: Record<string, unknown>
  ): NormalizedConversationCsvFields {
    return new NormalizedConversationCsvFields(
      this.toNullableFieldString(normalizedFields.chatSession),
      this.toNullableFieldString(normalizedFields.messageDate),
      this.toNullableFieldString(normalizedFields.sentDate),
      this.toNullableFieldString(normalizedFields.messageType),
      this.toNullableFieldString(normalizedFields.senderId),
      this.toNullableFieldString(normalizedFields.senderName),
      this.toNullableFieldString(normalizedFields.status),
      this.toNullableFieldString(normalizedFields.forwarded),
      this.toNullableFieldString(normalizedFields.replyTo),
      this.toNullableFieldString(normalizedFields.text),
      this.toNullableFieldString(normalizedFields.reactions),
      this.toNullableFieldString(normalizedFields.attachment),
      this.toNullableFieldString(normalizedFields.attachmentType),
      this.toNullableFieldString(normalizedFields.attachmentInfo)
    );
  }

  private toNullableFieldString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private runStructuringStage(
    cleanedMessages: CleanedConversationMessage[]
  ): StructuredConversationTurn[] {
    return this.conversationStructuringService.buildTurns(cleanedMessages);
  }

  private async persistNormalizedAudioFieldRepairsToRawMessages(
    conversationId: string,
    rawMessages: RawConversationStageMessage[],
    normalizedMessages: NormalizedConversationStageMessage[]
  ): Promise<void> {
    const rawMessagesByExternalId = new Map(
      rawMessages.map((rawMessage) => [rawMessage.externalId, rawMessage])
    );

    for (const normalizedMessage of normalizedMessages) {
      const rawMessage = rawMessagesByExternalId.get(normalizedMessage.externalId);
      if (!rawMessage) {
        continue;
      }

      const originalAttachment =
        this.toNullableFieldString(rawMessage.normalizedFields.attachment);
      const normalizedAttachment =
        this.toNullableFieldString(normalizedMessage.normalizedFields.attachment);
      if (!normalizedAttachment || !this.isSupportedAudioAttachment(normalizedAttachment)) {
        continue;
      }

      const patch: RawMessageAudioNormalizedFieldsPatch = {};
      const originalAudioResourceUrl =
        this.toNullableFieldString(rawMessage.normalizedFields.audioResourceUrl);
      const normalizedAudioResourceUrl =
        this.toNullableFieldString(normalizedMessage.normalizedFields.audioResourceUrl);
      const originalAssetUrl = this.toNullableFieldString(rawMessage.normalizedFields.assetUrl);
      const normalizedAssetUrl =
        this.toNullableFieldString(normalizedMessage.normalizedFields.assetUrl);

      if (normalizedAttachment !== originalAttachment) {
        patch.attachment = normalizedAttachment;
      }

      if (normalizedAudioResourceUrl && normalizedAudioResourceUrl !== originalAudioResourceUrl) {
        patch.audioResourceUrl = normalizedAudioResourceUrl;
      }

      if (normalizedAssetUrl && normalizedAssetUrl !== originalAssetUrl) {
        patch.assetUrl = normalizedAssetUrl;
      }

      if (Object.keys(patch).length === 0) {
        continue;
      }

      await this.conversationsRepositoryPort.updateRawMessageAudioNormalizedFields(
        conversationId,
        normalizedMessage.externalId,
        patch
      );
    }
  }

  private runChunkingStage(structuredTurns: StructuredConversationTurn[]): SemanticConversationChunk[] {
    return this.conversationChunkingService.buildSemanticChunks(structuredTurns);
  }

  private isSupportedAudioAttachment(attachment: string): boolean {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return extension === 'opus' || extension === 'mp3' || extension === 'm2a' || extension === 'm4a';
  }

  private async runEmbeddingStage(
    rawMessages: RawConversationMessage[],
    semanticChunks: SemanticConversationChunk[],
    existingEmbeddings: EmbeddingRepositoryRecord[]
  ): Promise<EmbeddedChunk[]> {
    if (semanticChunks.length === 0) {
      return [];
    }

    const rawMessagesByExternalId = this.buildRawMessagesIndex(rawMessages);
    const existingEmbeddingByChunkId = new Map<string, EmbeddingRepositoryRecord>();
    for (const existingEmbedding of existingEmbeddings) {
      if (!existingEmbeddingByChunkId.has(existingEmbedding.chunkId)) {
        existingEmbeddingByChunkId.set(existingEmbedding.chunkId, existingEmbedding);
      }
    }
    const embeddedChunks: EmbeddedChunk[] = [];

    for (const [chunkIndex, chunk] of semanticChunks.entries()) {
      const payload = this.buildEmbeddingPayload(chunk, rawMessagesByExternalId);
      const existingEmbedding = existingEmbeddingByChunkId.get(chunk.chunkId);
      const vector =
        existingEmbedding?.vector ?? (await this.embeddingPort.generateEmbedding(payload.chunkMessage));
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

    return points.length;
  }

  private async persistProcessedConversation(
    conversationId: string,
    rawMessages: RawConversationMessage[],
    normalizedMessages: NormalizedConversationStageMessage[],
    cleanedMessages: CleanedConversationMessage[],
    structuredTurns: StructuredConversationTurn[],
    semanticChunks: SemanticConversationChunk[],
    embeddedChunks: EmbeddedChunk[]
  ): Promise<void> {
    const stages = this.buildProcessedConversationStages(
      conversationId,
      rawMessages,
      normalizedMessages,
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
    normalizedMessages: NormalizedConversationStageMessage[],
    cleanedMessages: CleanedConversationMessage[],
    structuredTurns: StructuredConversationTurn[],
    semanticChunks: SemanticConversationChunk[],
    embeddedChunks: EmbeddedChunk[]
  ): ProcessedConversationStages {
    const sourceFileByExternalId = new Map(
      rawMessages.map((rawMessage) => [rawMessage.externalId, rawMessage.sourceFile])
    );

    return {
      conversationId,
      contactName: this.resolveConversationContactName(rawMessages),
      rawMessages: rawMessages.map((message) => this.toRawStageMessage(message)),
      normalizedMessages: normalizedMessages.map((message) => ({
        externalId: message.externalId,
        sentAt: message.sentAt,
        sender: message.sender,
        text: message.text,
        sourceFile: sourceFileByExternalId.get(message.externalId) ?? 'unknown',
        rowNumber: message.rowNumber,
        direction: message.direction,
        normalizedFields: message.normalizedFields
      })),
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
      conversationId: semanticChunk.conversationId,
      chunkId: semanticChunk.chunkId,
      messageIds,
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
    filePattern: string | null;
    contactName: string | null;
    firstMessageDate: string | null;
    lastMessageDate: string | null;
    lastMessageText: string | null;
  } {
    const conversationalMessages = rawMessages.filter(
      (rawMessage) =>
        rawMessage.direction === MessageDirection.Incoming ||
        rawMessage.direction === MessageDirection.Outgoing
    );
    // Business reason: WhatsApp Business notifications and number-change events are auto-generated
    // and are not part of the real conversation timeline. We only use them when no customer/agent
    // messages exist in the conversation.
    const timelineMessages = conversationalMessages.length > 0 ? conversationalMessages : rawMessages;
    const datedTimelineMessages = timelineMessages
      .filter((rawMessage): rawMessage is RawConversationMessage & { sentAt: Date } => rawMessage.sentAt !== null)
      .sort((left, right) => {
        const delta = left.sentAt.getTime() - right.sentAt.getTime();

        if (delta !== 0) {
          return delta;
        }

        return left.rowNumber - right.rowNumber;
      });

    const firstRawMessage = datedTimelineMessages[0];
    const lastRawMessage = datedTimelineMessages[datedTimelineMessages.length - 1];
    const firstMessageDate = firstRawMessage?.sentAt?.toISOString() ?? null;
    const lastMessageDate = lastRawMessage?.sentAt?.toISOString() ?? null;

    return {
      createdAt: new Date(),
      source: rawMessages[0]?.sourceFile ?? 'unknown',
      filePattern: this.resolveConversationFilePattern(rawMessages),
      contactName: this.resolveConversationContactName(rawMessages),
      firstMessageDate,
      lastMessageDate,
      lastMessageText:
        lastRawMessage?.normalizedFields.text ??
        timelineMessages[timelineMessages.length - 1]?.normalizedFields.text ??
        null
    };
  }

  private resolveConversationContactName(rawMessages: RawConversationMessage[]): string | null {
    for (const rawMessage of rawMessages) {
      if (rawMessage.contactName) {
        return rawMessage.contactName;
      }
    }

    return null;
  }

  private resolveConversationFilePattern(rawMessages: RawConversationMessage[]): string | null {
    const uniqueFilePatterns: string[] = [];

    for (const rawMessage of rawMessages) {
      const filePattern = this.resolveRawMessageFilePattern(rawMessage);

      if (!filePattern || uniqueFilePatterns.includes(filePattern)) {
        continue;
      }

      uniqueFilePatterns.push(filePattern);
    }

    if (uniqueFilePatterns.length === 0) {
      return null;
    }

    const preferredFilePattern = uniqueFilePatterns.find(
      (filePattern) => !this.isRenamedPhoneFilePattern(filePattern)
    );

    return preferredFilePattern ?? uniqueFilePatterns[0] ?? null;
  }

  private isRenamedPhoneFilePattern(filePattern: string): boolean {
    const withoutPrefix = filePattern.replace(/^whatsapp\s*-\s*/i, '').trim();
    return /^\+?\d+$/.test(withoutPrefix);
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

  private toRawAudioTranscriptionCandidates(
    conversationId: string,
    normalizedMessages: NormalizedConversationStageMessage[],
    conversationFilePattern: string | null
  ): RawAudioTranscriptionCandidate[] {
    return normalizedMessages.map((rawMessage) => ({
      conversationId,
      rawMessageExternalId: rawMessage.externalId,
      conversationFilePattern,
      rawMessageSentAt: rawMessage.sentAt,
      normalizedFields: { ...(rawMessage.normalizedFields ?? {}) }
    }));
  }

  private resolveRawMessageFilePattern(rawMessage: RawConversationMessage): string | null {
    const filePatternFromChatSession = this.normalizeFilePatternFromChatSession(
      rawMessage.normalizedFields.chatSession
    );
    if (filePatternFromChatSession) {
      return filePatternFromChatSession;
    }

    return this.normalizeFilePatternFromSourceFile(rawMessage.filePattern);
  }

  private normalizeFilePatternFromSourceFile(pattern: string | null): string | null {
    if (!pattern) {
      return null;
    }

    const cleaned = this.stripDirectionalUnicodeMarkers(pattern).trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  private normalizeFilePatternFromChatSession(pattern: string | null): string | null {
    if (!pattern) {
      return null;
    }

    const cleaned = this.stripDirectionalUnicodeMarkers(pattern)
      .trim()
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .trim();
    if (!cleaned) {
      return null;
    }

    const label = this.extractConversationLabelFromPattern(cleaned);
    if (!label) {
      return null;
    }

    const formattedLabel = this.formatAssetPhoneLabel(label);
    return formattedLabel;
  }

  private stripDirectionalUnicodeMarkers(value: string): string {
    return value.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  }

  private formatAssetPhoneLabel(label: string): string {
    const trimmedLabel = this.replaceEmojiLikeCharsWithUnderscore(label.trim());
    const digitsOnly = trimmedLabel.replace(/\D/g, '');
    const isDigitsOnlyInternationalPhone = /^\+\d+$/.test(trimmedLabel);

    if (!isDigitsOnlyInternationalPhone) {
      return trimmedLabel;
    }

    if (trimmedLabel.startsWith('+34') && digitsOnly.length === 11) {
      const nationalNumber = digitsOnly.slice(2);
      return `+34 ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 5)} ${nationalNumber.slice(5, 7)} ${nationalNumber.slice(7, 9)}`;
    }

    return trimmedLabel;
  }

  private replaceEmojiLikeCharsWithUnderscore(value: string): string {
    const graphemes = this.segmentIntoGraphemes(value);
    return graphemes
      .map((grapheme) => (this.isEmojiLikeGrapheme(grapheme) ? '_' : grapheme))
      .join('');
  }

  private segmentIntoGraphemes(value: string): string[] {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(value), (segment) => segment.segment);
    }

    return Array.from(value);
  }

  private isEmojiLikeGrapheme(value: string): boolean {
    const emojiLikeCharsPattern =
      /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u;

    return emojiLikeCharsPattern.test(value);
  }

  private extractConversationLabelFromPattern(pattern: string): string {
    const label = pattern.replace(/^whatsapp\s*-\s*/i, '').trim();
    return label.length > 0 ? label : pattern.trim();
  }

  private omitTextFromNormalizedFields(
    normalizedFields: RawConversationMessage['normalizedFields']
  ): Record<string, unknown> {
    const normalizedFieldsRecord = normalizedFields as unknown as Record<string, unknown>;
    const { text, ...remainingFields } = normalizedFieldsRecord;
    void text;
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

  private toMessageDirection(direction: RawStageDirection): MessageDirection {
    if (direction === 'agent_to_customer') {
      return MessageDirection.Outgoing;
    }

    if (direction === 'customer_to_agent') {
      return MessageDirection.Incoming;
    }

    return MessageDirection.Unknown;
  }

  private findEquivalentRawMessageIndex(
    existingMessages: RawConversationStageMessage[],
    incomingMessage: RawConversationStageMessage,
    startIndex: number
  ): number {
    for (let index = startIndex; index < existingMessages.length; index += 1) {
      const existingMessage = existingMessages[index];
      if (existingMessage === undefined) {
        continue;
      }

      if (this.areEquivalentRawMessages(existingMessage, incomingMessage)) {
        return index;
      }
    }

    return -1;
  }

  private areEquivalentRawMessages(
    left: RawConversationStageMessage,
    right: RawConversationStageMessage
  ): boolean {
    if (left.externalId === right.externalId) {
      return true;
    }

    const leftSentAt = this.normalizeRawMessageDate(left.sentAt);
    const rightSentAt = this.normalizeRawMessageDate(right.sentAt);
    const leftSender = this.normalizeRawMessageValue(left.sender);
    const rightSender = this.normalizeRawMessageValue(right.sender);
    const leftText = this.normalizeRawMessageValue(left.text);
    const rightText = this.normalizeRawMessageValue(right.text);
    const leftAttachment = this.normalizeRawMessageValue(left.normalizedFields.attachment);
    const rightAttachment = this.normalizeRawMessageValue(right.normalizedFields.attachment);
    const leftAttachmentType = this.normalizeRawMessageValue(left.normalizedFields.attachmentType);
    const rightAttachmentType = this.normalizeRawMessageValue(right.normalizedFields.attachmentType);

    return (
      leftSentAt === rightSentAt &&
      left.direction === right.direction &&
      leftSender === rightSender &&
      leftText === rightText &&
      leftAttachment === rightAttachment &&
      leftAttachmentType === rightAttachmentType
    );
  }

  private ensureUniqueExternalId(
    conversationId: string,
    incomingMessage: RawConversationStageMessage,
    currentMessages: RawConversationStageMessage[]
  ): RawConversationStageMessage {
    const externalIds = new Set(currentMessages.map((message) => message.externalId));
    if (!externalIds.has(incomingMessage.externalId)) {
      return incomingMessage;
    }

    const messageFingerprint = [
      this.normalizeRawMessageDate(incomingMessage.sentAt),
      incomingMessage.direction,
      this.normalizeRawMessageValue(incomingMessage.sender),
      this.normalizeRawMessageValue(incomingMessage.text),
      this.normalizeRawMessageValue(incomingMessage.normalizedFields.attachment),
      String(incomingMessage.rowNumber)
    ].join('|');

    const baseHash = createHash('sha256')
      .update(`${conversationId}|${messageFingerprint}`)
      .digest('hex')
      .slice(0, 12);

    let candidateExternalId = `${conversationId}-merged-${baseHash}`;
    let collisionIndex = 1;

    while (externalIds.has(candidateExternalId)) {
      candidateExternalId = `${conversationId}-merged-${baseHash}-${collisionIndex}`;
      collisionIndex += 1;
    }

    return {
      ...incomingMessage,
      externalId: candidateExternalId
    };
  }

  private sortRawStageMessages(
    rawMessages: RawConversationStageMessage[]
  ): RawConversationStageMessage[] {
    return [...rawMessages].sort((left, right) => {
      const leftTime = left.sentAt ? new Date(left.sentAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.sentAt ? new Date(right.sentAt).getTime() : Number.MAX_SAFE_INTEGER;

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      if (left.rowNumber !== right.rowNumber) {
        return left.rowNumber - right.rowNumber;
      }

      return left.externalId.localeCompare(right.externalId);
    });
  }

  private normalizeRawMessageDate(value: string | null): string {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value.trim().toLowerCase();
    }

    return parsed.toISOString();
  }

  private normalizeRawMessageValue(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
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
    let minDateMs: number | null = null;
    let maxDateMs: number | null = null;

    for (const message of messages) {
      const sentAt = message.sentAt;
      if (!sentAt) {
        continue;
      }

      const sentAtMs = sentAt.getTime();
      minDateMs = minDateMs === null ? sentAtMs : Math.min(minDateMs, sentAtMs);
      maxDateMs = maxDateMs === null ? sentAtMs : Math.max(maxDateMs, sentAtMs);
    }

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
      minDateMs !== null ? new Date(minDateMs).toISOString() : null,
      maxDateMs !== null ? new Date(maxDateMs).toISOString() : null,
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
