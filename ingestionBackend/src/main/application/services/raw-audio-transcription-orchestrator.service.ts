import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ConversationsRepositoryPort,
  RawConversationAudioDetails
} from '../ports/outbound/conversations-repository.port';
import type { FailedAudioResourceLogPort } from '../ports/outbound/failed-audio-resource-log.port';
import { TOKENS } from '../ports/tokens';
import { AudioTranscribeCommand } from '../use-cases/audio-transcribe/audio-transcribe.command';
import type { AudioTranscribeResult } from '../use-cases/audio-transcribe/audio-transcribe.result';
import { AudioTranscribeUseCase } from '../use-cases/audio-transcribe/audio-transcribe.use-case';

export type RawAudioTranscriptionCandidate = {
  conversationId: string;
  rawMessageExternalId: string;
  conversationFilePattern: string | null;
  rawMessageSentAt: string | Date | null;
  normalizedFields: {
    attachment?: unknown;
    audioResourceUrl?: unknown;
    [key: string]: unknown;
  };
};

@Injectable()
export class RawAudioTranscriptionOrchestratorService {
  private readonly logger = new Logger(RawAudioTranscriptionOrchestratorService.name);

  constructor(
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort,
    @Inject(TOKENS.FailedAudioResourceLogPort)
    private readonly failedAudioResourceLogPort: FailedAudioResourceLogPort,
    private readonly audioTranscribeUseCase: AudioTranscribeUseCase
  ) {}

  public enqueueMany(candidates: RawAudioTranscriptionCandidate[]): number {
    let enqueuedJobs = 0;

    for (const candidate of candidates) {
      const audioResourceUrl = this.resolveAudioResourceUrl(candidate);
      if (!audioResourceUrl) {
        continue;
      }

      this.audioTranscribeUseCase.executeAsync(
        new AudioTranscribeCommand(audioResourceUrl),
        (payload, params) => {
          void this.onAudioTranscriptionCompleted(payload, params);
        },
        {
          conversationId: candidate.conversationId,
          rawMessageExternalId: candidate.rawMessageExternalId,
          originalAudioResourceUrl: audioResourceUrl
        }
      );
      enqueuedJobs += 1;
    }

    return enqueuedJobs;
  }

  private async onAudioTranscriptionCompleted(
    payload: AudioTranscribeResult,
    params: Record<string, unknown>
  ): Promise<void> {
    const conversationId = typeof params.conversationId === 'string' ? params.conversationId : null;
    const rawMessageExternalId =
      typeof params.rawMessageExternalId === 'string' ? params.rawMessageExternalId : null;
    const originalAudioResourceUrl =
      typeof params.originalAudioResourceUrl === 'string' ? params.originalAudioResourceUrl : null;

    if (!conversationId || !rawMessageExternalId) {
      this.logger.warn(
        `Ignoring audio transcription callback because params are invalid: ${JSON.stringify(params)}`
      );
      return;
    }

    const audioDetails: RawConversationAudioDetails = {
      type: payload.type,
      transcription: payload.transcription,
      totalTimeInSeconds: payload.totalTimeInSeconds,
      language: payload.language,
      bars: payload.bars
    };

    try {
      await this.conversationsRepositoryPort.upsertRawMessageAudioDetails(
        conversationId,
        rawMessageExternalId,
        audioDetails
      );
      if (originalAudioResourceUrl && this.isAudioResourceReadFailure(payload)) {
        await this.failedAudioResourceLogPort.appendOriginalUrl(originalAudioResourceUrl);
      }
    } catch (error) {
      this.logger.error(
        `Unable to persist audioDetails for conversationId=${conversationId}, rawMessageExternalId=${rawMessageExternalId}. ${String(error)}`
      );
    }
  }

  private isAudioResourceReadFailure(payload: AudioTranscribeResult): boolean {
    if (payload.type !== 'noise') {
      return false;
    }

    const transcription = payload.transcription?.toLowerCase() ?? '';
    return (
      transcription.includes('audio resource does not exist') ||
      transcription.includes('could not download audio file')
    );
  }

  private resolveAudioResourceUrl(candidate: RawAudioTranscriptionCandidate): string | null {
    const attachment = this.toNonEmptyString(candidate.normalizedFields.attachment);
    if (!attachment || !this.isSupportedAudioAttachment(attachment)) {
      return null;
    }

    return this.toNonEmptyString(candidate.normalizedFields.audioResourceUrl);
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isSupportedAudioAttachment(attachment: string): boolean {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return extension === 'opus' || extension === 'mp3' || extension === 'm2a' || extension === 'm4a';
  }
}
