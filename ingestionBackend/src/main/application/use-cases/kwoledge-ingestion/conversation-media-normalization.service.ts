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
    conversationId: string,
    rawMessages: RawConversationStageMessage[]
  ): Promise<NormalizeConversationResult> {
    const normalizedMessages: RawConversationStageMessage[] = [];
    let normalizedCount = 0;
    let missingCount = 0;

    for (const rawMessage of rawMessages) {
      const normalized = await this.normalizeMessage(conversationId, rawMessage);
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
    conversationId: string,
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

    const baseAssetUrl = this.buildAssetUrl(conversationId, messageDate, sentAt, attachment);
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

      const resolvedAttachment = this.resolveAttachmentWithUpdatedAudioExtension(
        attachment,
        candidateUrl
      );
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
    conversationId: string,
    messageDate: string | null,
    sentAt: string | null,
    attachment: string
  ): string | null {
    const formattedDate = this.formatAssetDate(messageDate, sentAt);
    const attachmentParts = this.resolveAudioAttachmentParts(attachment);
    if (!formattedDate || !attachmentParts) {
      return null;
    }

    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      return null;
    }

    const relativePath = `${normalizedConversationId}/${formattedDate} - ${attachmentParts.id}.${attachmentParts.extension}`;
    const normalizedBase = this.staticAssetsBaseUrlPort.getBaseUrl().trim().replace(/\/+$/, '');

    return `${normalizedBase}/${relativePath.normalize('NFC')}`;
  }

  private resolveAudioAttachmentParts(
    attachment: string
  ): { id: string; extension: string } | null {
    const trimmed = attachment.trim();
    if (!trimmed) {
      return null;
    }

    const uuidWithExt = trimmed.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(opus|mp3|m2a|m4a)$/i
    );
    if (uuidWithExt) {
      const [, attachmentId, extension] = uuidWithExt;
      if (!attachmentId || !extension) {
        return null;
      }

      return {
        id: attachmentId,
        extension: extension.toLowerCase()
      };
    }

    return null;
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

  private resolveAttachmentWithUpdatedAudioExtension(
    currentAttachment: string,
    resolvedAudioUrl: string
  ): string | null {
    const normalizedAttachment = currentAttachment.trim();
    if (!normalizedAttachment) {
      return null;
    }

    const attachmentMatch = normalizedAttachment.match(/^(.*)\.([a-z0-9]+)$/i);
    if (!attachmentMatch) {
      return null;
    }

    const attachmentBaseName = attachmentMatch[1] ?? '';
    const attachmentExtension = (attachmentMatch[2] ?? '').toLowerCase();
    if (!attachmentBaseName || !this.audioExtensions.has(attachmentExtension)) {
      return null;
    }

    const resolvedExtension = this.extractAudioExtensionFromUrl(resolvedAudioUrl);
    if (!resolvedExtension || !this.audioExtensions.has(resolvedExtension)) {
      return null;
    }

    if (resolvedExtension === attachmentExtension) {
      return normalizedAttachment;
    }

    return `${attachmentBaseName}.${resolvedExtension}`;
  }

  private extractAudioExtensionFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split('/').pop();
      if (!lastSegment) {
        return null;
      }

      const decodedSegment = decodeURIComponent(lastSegment);
      const extensionMatch = decodedSegment.match(/\.([a-z0-9]+)$/i);
      return extensionMatch?.[1]?.toLowerCase() ?? null;
    } catch {
      return null;
    }
  }
}
