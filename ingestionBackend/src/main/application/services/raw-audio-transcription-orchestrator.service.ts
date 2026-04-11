import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ConversationsRepositoryPort,
  RawConversationAudioDetails
} from '../ports/outbound/conversations-repository.port';
import type { FailedAudioResourceLogPort } from '../ports/outbound/failed-audio-resource-log.port';
import type { StaticAssetsBaseUrlPort } from '../ports/outbound/static-assets-base-url.port';
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
    chatSession?: unknown;
    messageDate?: unknown;
    attachment?: unknown;
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
    @Inject(TOKENS.StaticAssetsBaseUrlPort)
    private readonly staticAssetsBaseUrlPort: StaticAssetsBaseUrlPort,
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
    return transcription.includes('audio resource does not exist');
  }

  private resolveAudioResourceUrl(candidate: RawAudioTranscriptionCandidate): string | null {
    const attachment = this.toNonEmptyString(candidate.normalizedFields.attachment);
    if (!attachment || !this.isSupportedAudioAttachment(attachment)) {
      return null;
    }

    const filePattern = this.resolveRawMessageFilePattern(
      candidate.conversationFilePattern,
      this.toNullableString(candidate.normalizedFields.chatSession)
    );
    if (!filePattern) {
      return null;
    }

    const sentAt = this.toDateOrNull(candidate.rawMessageSentAt);
    const formattedDate = this.formatAssetDate(
      this.toNullableString(candidate.normalizedFields.messageDate),
      sentAt
    );
    if (!formattedDate) {
      return null;
    }

    const assetConversation = this.resolveAssetConversationFromPattern(filePattern);
    const relativePath = `${assetConversation.folderName}/${formattedDate} - ${assetConversation.label} - ${attachment}`;
    const normalizedPath = relativePath
      .normalize('NFC')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const baseUrl = this.staticAssetsBaseUrlPort.getBaseUrl().replace(/\/+$/, '');
    return `${baseUrl}/${normalizedPath}`;
  }

  private toDateOrNull(value: string | Date | null): Date | null {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toNonEmptyString(value: unknown): string | null {
    return this.toNullableString(value);
  }

  private resolveRawMessageFilePattern(
    conversationFilePattern: string | null,
    chatSession: string | null
  ): string | null {
    const filePatternFromSourceFile = this.normalizeFilePatternFromSourceFile(conversationFilePattern);
    if (filePatternFromSourceFile) {
      return filePatternFromSourceFile;
    }

    return this.normalizeFilePatternFromChatSession(chatSession);
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
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) {
      return null;
    }

    const label = this.extractConversationLabelFromPattern(cleaned);
    if (!label) {
      return null;
    }

    const formattedLabel = this.formatAssetPhoneLabel(label);
    return `WhatsApp - ${formattedLabel}`;
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
    const emojiLikeCharsPattern =
      /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/gu;

    return value.replace(emojiLikeCharsPattern, '_').replace(/\s+/g, ' ').trim();
  }

  private resolveAssetConversationFromPattern(filePattern: string): {
    folderName: string;
    label: string;
  } {
    const label = this.extractConversationLabelFromPattern(filePattern);
    const folderName = /^whatsapp\s*-\s*/i.test(filePattern)
      ? filePattern
      : `WhatsApp - ${label}`;
    return { folderName, label };
  }

  private extractConversationLabelFromPattern(pattern: string): string {
    const label = pattern.replace(/^whatsapp\s*-\s*/i, '').trim();
    return label.length > 0 ? label : pattern.trim();
  }

  private isSupportedAudioAttachment(attachment: string): boolean {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return extension === 'opus' || extension === 'mp3' || extension === 'm2a' || extension === 'm4a';
  }

  private formatAssetDate(messageDate: string | null, sentAt: Date | null): string | null {
    const normalizedMessageDate = this.normalizeMessageDate(messageDate);
    if (normalizedMessageDate) {
      return normalizedMessageDate;
    }

    if (!sentAt) {
      return null;
    }

    const year = sentAt.getFullYear();
    const month = String(sentAt.getMonth() + 1).padStart(2, '0');
    const day = String(sentAt.getDate()).padStart(2, '0');
    const hours = String(sentAt.getHours()).padStart(2, '0');
    const minutes = String(sentAt.getMinutes()).padStart(2, '0');
    const seconds = String(sentAt.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours} ${minutes} ${seconds}`;
  }

  private normalizeMessageDate(messageDate: string | null): string | null {
    const trimmed = messageDate?.trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2})[: ](\d{2})[: ](\d{2})$/
    );

    if (!match) {
      return null;
    }

    return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
  }
}
