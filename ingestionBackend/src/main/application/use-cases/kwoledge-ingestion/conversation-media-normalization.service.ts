import { Inject, Injectable } from '@nestjs/common';
import type { AssetResourceProbePort } from '../../ports/outbound/asset-resource-probe.port';
import type { StaticAssetsBaseUrlPort } from '../../ports/outbound/static-assets-base-url.port';
import { TOKENS } from '../../ports/tokens';
import type { RawConversationStageMessage } from '../../ports/outbound/conversations-repository.port';
import { ImazingMediaUrlCandidateService } from './imazing-media-url-candidate.service';

export type NormalizeConversationResult = {
  messages: RawConversationStageMessage[];
  normalizedCount: number;
  missingCount: number;
};

@Injectable()
export class ConversationMediaNormalizationService {
  private readonly candidateResolver = new ImazingMediaUrlCandidateService();
  private readonly audioExtensions = new Set(['opus', 'mp3', 'm2a', 'm4a']);

  constructor(
    @Inject(TOKENS.StaticAssetsBaseUrlPort)
    private readonly staticAssetsBaseUrlPort: StaticAssetsBaseUrlPort,
    @Inject(TOKENS.AssetResourceProbePort)
    private readonly assetResourceProbePort: AssetResourceProbePort
  ) {}

  public async normalizeConversation(
    filePattern: string | null,
    rawMessages: RawConversationStageMessage[]
  ): Promise<NormalizeConversationResult> {
    const normalizedMessages: RawConversationStageMessage[] = [];
    let normalizedCount = 0;
    let missingCount = 0;

    for (const rawMessage of rawMessages) {
      const normalized = await this.normalizeMessage(filePattern, rawMessage);
      if (normalized.wasNormalized) {
        normalizedCount += 1;
      }
      if (normalized.wasMissing) {
        missingCount += 1;
      }
      normalizedMessages.push(normalized.message);
    }

    return {
      messages: normalizedMessages,
      normalizedCount,
      missingCount
    };
  }

  private async normalizeMessage(
    filePattern: string | null,
    rawMessage: RawConversationStageMessage
  ): Promise<{ message: RawConversationStageMessage; wasNormalized: boolean; wasMissing: boolean }> {
    const normalizedFields = {
      ...(rawMessage.normalizedFields ?? {})
    } as Record<string, unknown>;

    const attachment = this.toNonEmptyString(normalizedFields.attachment);
    const messageDate = this.toNullableString(normalizedFields.messageDate);
    const sentAt = this.toNullableString(rawMessage.sentAt);

    if (!attachment) {
      return {
        message: {
          ...rawMessage,
          normalizedFields
        },
        wasNormalized: false,
        wasMissing: false
      };
    }

    const baseAssetUrl = this.buildAssetUrl(filePattern, messageDate, sentAt, attachment);
    if (baseAssetUrl) {
      normalizedFields.assetUrl = baseAssetUrl;
    }

    if (!baseAssetUrl || !this.isAudioAttachment(attachment)) {
      return {
        message: {
          ...rawMessage,
          normalizedFields
        },
        wasNormalized: false,
        wasMissing: false
      };
    }

    const candidateUrls = this.candidateResolver.isSupportedAudioResourceUrl(baseAssetUrl)
      ? this.candidateResolver.getCandidateAudioUrls(baseAssetUrl)
      : [baseAssetUrl];

    for (const candidateUrl of candidateUrls) {
      const probe = await this.assetResourceProbePort.probeHead(candidateUrl);
      if (!probe.ok) {
        continue;
      }

      normalizedFields.audioResourceUrl = candidateUrl;
      normalizedFields.assetUrl = candidateUrl;

      const resolvedAttachment = this.extractAttachmentFromUrl(candidateUrl);
      if (resolvedAttachment && resolvedAttachment !== attachment) {
        normalizedFields.attachment = resolvedAttachment;
      }

      return {
        message: {
          ...rawMessage,
          normalizedFields
        },
        wasNormalized: candidateUrl !== baseAssetUrl,
        wasMissing: false
      };
    }

    normalizedFields.audioResourceUrl = baseAssetUrl;
    return {
      message: {
        ...rawMessage,
        normalizedFields
      },
      wasNormalized: false,
      wasMissing: true
    };
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toNullableString(value: unknown): string | null {
    return this.toNonEmptyString(value);
  }

  private isAudioAttachment(attachment: string): boolean {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return !!extension && this.audioExtensions.has(extension);
  }

  private buildAssetUrl(
    filePattern: string | null,
    messageDate: string | null,
    sentAt: string | null,
    attachment: string
  ): string | null {
    const formattedDate = this.formatAssetDate(messageDate, sentAt);
    if (!formattedDate || !filePattern) {
      return null;
    }

    const assetConversation = this.resolveAssetConversationFromPattern(filePattern);
    const relativePath = `${assetConversation.folderName}/${formattedDate} - ${attachment}`;

    const normalizedBase = this.staticAssetsBaseUrlPort.getBaseUrl().trim().replace(/\/+$/, '');
    const normalizedPath = relativePath
      .normalize('NFC')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${normalizedBase}/${normalizedPath}`;
  }

  private resolveAssetConversationFromPattern(filePattern: string): {
    folderName: string;
  } {
    const folderName = this.extractConversationLabelFromPattern(filePattern);
    return { folderName };
  }

  private extractConversationLabelFromPattern(pattern: string): string {
    const label = pattern.replace(/^whatsapp\s*-\s*/i, '').trim();
    return label.length > 0 ? label : pattern.trim();
  }

  private formatAssetDate(messageDate: string | null, sentAt: string | null): string | null {
    const normalizedMessageDate = this.normalizeMessageDate(messageDate);
    if (normalizedMessageDate) {
      return normalizedMessageDate;
    }

    if (!sentAt) {
      return null;
    }

    const parsed = new Date(sentAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const seconds = String(parsed.getSeconds()).padStart(2, '0');

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

  private extractAttachmentFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split('/').pop();
      return lastSegment ? decodeURIComponent(lastSegment) : null;
    } catch {
      return null;
    }
  }
}
