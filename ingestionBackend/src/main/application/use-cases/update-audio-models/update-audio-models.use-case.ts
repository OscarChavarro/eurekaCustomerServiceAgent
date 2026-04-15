import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  RawMessageAudioNormalizedFieldsPatch,
  ConversationsRepositoryPort,
  RawConversationAudioMessage
} from '../../ports/outbound/conversations-repository.port';
import type { AssetResourceProbePort } from '../../ports/outbound/asset-resource-probe.port';
import { TOKENS } from '../../ports/tokens';
import { ImazingMediaUrlCandidateService } from '../kwoledge-ingestion/imazing-media-url-candidate.service';
import type { RawAudioTranscriptionCandidate } from '../../services/raw-audio-transcription-orchestrator.service';
import { RawAudioTranscriptionOrchestratorService } from '../../services/raw-audio-transcription-orchestrator.service';
import { FixFilePatternUseCase } from '../fix-file-pattern/fix-file-pattern.use-case';
import { UpdateAudioModelsResult } from './update-audio-models.result';

@Injectable()
export class UpdateAudioModelsUseCase {
  private readonly logger = new Logger(UpdateAudioModelsUseCase.name);
  private readonly mediaUrlCandidateService = new ImazingMediaUrlCandidateService();
  private readonly audioExtensions = new Set(['opus', 'mp3', 'm2a', 'm4a']);

  constructor(
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort,
    @Inject(TOKENS.AssetResourceProbePort)
    private readonly assetResourceProbePort: AssetResourceProbePort,
    private readonly rawAudioTranscriptionOrchestratorService: RawAudioTranscriptionOrchestratorService,
    private readonly fixFilePatternUseCase: FixFilePatternUseCase
  ) {}

  public async execute(): Promise<UpdateAudioModelsResult> {
    const audioMessagesInConversationsWithAudioDetails =
      await this.conversationsRepositoryPort
        .findRawMessagesWithAudioAttachmentFromConversationsWithAudioDetails();
    const patchedAudioMessages = await this.repairAudioAttachmentExtensions(
      audioMessagesInConversationsWithAudioDetails
    );
    if (patchedAudioMessages > 0) {
      this.logger.log(
        `updateAudioModels extension audit fixed ${patchedAudioMessages} audio attachment/url records.`
      );
    }

    const rawAudioMessages =
      await this.conversationsRepositoryPort.findRawMessagesWithAudioAttachment();
    const filePatternFixResult = await this.fixFilePatternUseCase.execute(rawAudioMessages);
    const retryCandidates = rawAudioMessages.filter(
      (rawAudioMessage) => rawAudioMessage.audioDetails?.type !== 'voice'
    );
    const queuedJobs = this.rawAudioTranscriptionOrchestratorService.enqueueMany(
      retryCandidates.map((retryCandidate) =>
        this.toTranscriptionCandidate(
          retryCandidate,
          filePatternFixResult.resolvedFilePatternByConversationId
        )
      )
    );

    return new UpdateAudioModelsResult(
      rawAudioMessages.length,
      rawAudioMessages.length - retryCandidates.length,
      retryCandidates.length,
      queuedJobs
    );
  }

  private async repairAudioAttachmentExtensions(
    rawAudioMessages: RawConversationAudioMessage[]
  ): Promise<number> {
    let updatedMessagesCount = 0;

    for (const rawAudioMessage of rawAudioMessages) {
      const originalAttachment = this.toNonEmptyString(rawAudioMessage.normalizedFields.attachment);
      if (!originalAttachment || !this.isSupportedAudioAttachment(originalAttachment)) {
        continue;
      }

      const originalAudioResourceUrl = this.toNonEmptyString(
        rawAudioMessage.normalizedFields.audioResourceUrl
      ) ?? this.toNonEmptyString(rawAudioMessage.normalizedFields.assetUrl);
      if (
        !originalAudioResourceUrl
        || !this.mediaUrlCandidateService.isSupportedAudioResourceUrl(originalAudioResourceUrl)
      ) {
        continue;
      }

      const candidateUrls = this.mediaUrlCandidateService.getCandidateAudioUrls(originalAudioResourceUrl);
      const resolvedUrl = await this.findFirstReachableAudioUrl(candidateUrls);
      if (!resolvedUrl) {
        continue;
      }

      const normalizedPatch =
        this.buildNormalizedFieldsPatchForResolvedAudio(
          originalAttachment,
          originalAudioResourceUrl,
          resolvedUrl
        );
      if (!normalizedPatch) {
        continue;
      }

      await this.conversationsRepositoryPort.updateRawMessageAudioNormalizedFields(
        rawAudioMessage.conversationId,
        rawAudioMessage.rawMessageExternalId,
        normalizedPatch
      );
      if (
        typeof normalizedPatch.attachment === 'string'
        && normalizedPatch.attachment !== originalAttachment
      ) {
        const previousExtension = this.extractAttachmentExtension(originalAttachment) ?? 'unknown';
        const nextExtension = this.extractAttachmentExtension(normalizedPatch.attachment) ?? 'unknown';
        this.logger.log(
          `Audio attachment extension renamed in MongoDB for conversationId=${rawAudioMessage.conversationId}, rawMessageExternalId=${rawAudioMessage.rawMessageExternalId}: attachment "${originalAttachment}" -> "${normalizedPatch.attachment}" (${previousExtension} -> ${nextExtension})`
        );
      }
      updatedMessagesCount += 1;
    }

    return updatedMessagesCount;
  }

  private async findFirstReachableAudioUrl(candidateUrls: string[]): Promise<string | null> {
    for (const candidateUrl of candidateUrls) {
      const probe = await this.assetResourceProbePort.probeHead(candidateUrl);
      if (probe.ok) {
        return probe.responseUrl?.trim() || candidateUrl;
      }
    }

    return null;
  }

  private buildNormalizedFieldsPatchForResolvedAudio(
    currentAttachment: string,
    currentAudioResourceUrl: string,
    resolvedAudioUrl: string
  ): RawMessageAudioNormalizedFieldsPatch | null {
    const currentAttachmentExtension = this.extractAttachmentExtension(currentAttachment);
    const resolvedAudioExtension = this.extractUrlAudioExtension(resolvedAudioUrl);
    if (!currentAttachmentExtension || !resolvedAudioExtension) {
      return null;
    }

    const patch: RawMessageAudioNormalizedFieldsPatch = {};
    if (currentAttachmentExtension !== resolvedAudioExtension) {
      patch.attachment = this.replaceAttachmentExtension(currentAttachment, resolvedAudioExtension);
    }

    if (resolvedAudioUrl !== currentAudioResourceUrl) {
      patch.audioResourceUrl = resolvedAudioUrl;
      patch.assetUrl = resolvedAudioUrl;
    }

    return Object.keys(patch).length > 0 ? patch : null;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isSupportedAudioAttachment(attachment: string): boolean {
    const extension = this.extractAttachmentExtension(attachment);
    return !!extension && this.audioExtensions.has(extension);
  }

  private extractAttachmentExtension(attachment: string): string | null {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return extension && extension.length > 0 ? extension : null;
  }

  private extractUrlAudioExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const fileName = decodeURIComponent(pathname.split('/').pop() ?? '');
      const extension = fileName.split('.').pop()?.toLowerCase();
      if (!extension || !this.audioExtensions.has(extension)) {
        return null;
      }

      return extension;
    } catch {
      return null;
    }
  }

  private replaceAttachmentExtension(attachment: string, nextExtension: string): string {
    return attachment.replace(/\.[^.]+$/, `.${nextExtension}`);
  }

  private toTranscriptionCandidate(
    rawAudioMessage: RawConversationAudioMessage,
    resolvedFilePatternByConversationId: Map<string, string | null>
  ): RawAudioTranscriptionCandidate {
    const resolvedFilePattern =
      resolvedFilePatternByConversationId.get(rawAudioMessage.conversationId) ??
      rawAudioMessage.conversationFilePattern;

    return {
      conversationId: rawAudioMessage.conversationId,
      rawMessageExternalId: rawAudioMessage.rawMessageExternalId,
      conversationFilePattern: resolvedFilePattern,
      rawMessageSentAt: rawAudioMessage.rawMessageSentAt,
      normalizedFields: {
        chatSession: rawAudioMessage.normalizedFields.chatSession,
        messageDate: rawAudioMessage.normalizedFields.messageDate,
        attachment: rawAudioMessage.normalizedFields.attachment,
        audioResourceUrl: rawAudioMessage.normalizedFields.audioResourceUrl
      }
    };
  }
}
