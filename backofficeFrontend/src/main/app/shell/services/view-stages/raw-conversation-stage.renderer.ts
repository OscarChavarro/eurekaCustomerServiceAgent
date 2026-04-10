import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import { FrontendSecretsService } from '../../../core/api/services/frontend-secrets.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class RawConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'raw' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);
  private readonly frontendSecretsService = inject(FrontendSecretsService);
  private readonly imageExtensions = new Set(['jpg', 'jpeg', 'gif', 'webp', 'png']);
  private static readonly WHATSAPP_PREFIX = /^whatsapp\s*-\s*/i;

  render(document: BackendConversationDocument): ChatMessage[] {
    const filePattern = this.toNonEmptyString(document.filePattern);

    return (document.rawMessages ?? []).map((rawMessage) =>
      this.messageBubbleFactory.createFromRaw(rawMessage, {
        text: rawMessage.text,
        imageUrl: filePattern
          ? this.buildImageUrl(
            filePattern,
            rawMessage.normalizedFields?.messageDate,
            rawMessage.sentAt,
            rawMessage.normalizedFields?.attachment
          )
          : undefined,
        stageLabel: 'raw',
        reviewStage: 'raw',
        reviewStageId: rawMessage.externalId
      })
    );
  }

  private buildImageUrl(
    filePattern: string,
    messageDate: string | null | undefined,
    sentAt: string | null,
    attachment: string | null | undefined
  ): string | undefined {
    const trimmedAttachment = attachment?.trim();

    if (!trimmedAttachment || !this.isImageAttachment(trimmedAttachment)) {
      return undefined;
    }

    const formattedDate = this.formatAssetDate(messageDate, sentAt);
    if (!formattedDate) {
      return undefined;
    }

    const assetConversation = this.resolveAssetConversationFromPattern(filePattern);
    if (!assetConversation) {
      return undefined;
    }

    const relativePath = `${assetConversation.folderName}/${formattedDate} - ${assetConversation.label} - ${trimmedAttachment}`;
    return this.toNormalizedHttpUrl(
      this.frontendSecretsService.staticAssetsBaseUrl,
      relativePath
    );
  }

  private resolveAssetConversationFromPattern(filePattern: string): {
    folderName: string;
    label: string;
  } | null {
    const label = this.extractConversationLabelFromPattern(filePattern);
    const folderName = filePattern.startsWith('WhatsApp - ')
      ? filePattern
      : `WhatsApp - ${label}`;
    return { folderName, label };
  }

  private normalizeConversationPattern(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (RawConversationStageRenderer.WHATSAPP_PREFIX.test(trimmed)) {
      const label = trimmed.replace(RawConversationStageRenderer.WHATSAPP_PREFIX, '').trim();
      return label ? `WhatsApp - ${label}` : null;
    }

    return trimmed;
  }

  private extractConversationLabelFromPattern(pattern: string): string {
    const label = pattern.replace(RawConversationStageRenderer.WHATSAPP_PREFIX, '').trim();
    return label.length > 0 ? label : pattern.trim();
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isImageAttachment(attachment: string): boolean {
    const extension = attachment.split('.').pop()?.toLowerCase();
    return !!extension && this.imageExtensions.has(extension);
  }

  private formatAssetDate(
    messageDate: string | null | undefined,
    sentAt: string | null
  ): string | null {
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

  private normalizeMessageDate(messageDate: string | null | undefined): string | null {
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

  private toNormalizedHttpUrl(baseUrl: string, relativePath: string): string {
    const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
    const normalizedPath = relativePath
      .normalize('NFC')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${normalizedBase}/${normalizedPath}`;
  }
}
