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

  render(document: BackendConversationDocument): ChatMessage[] {
    const assetConversationLabel = this.resolveAssetConversationLabel(document);

    return (document.rawMessages ?? []).map((rawMessage) =>
      this.messageBubbleFactory.createFromRaw(rawMessage, {
        text: rawMessage.text,
        imageUrl: this.buildImageUrl(
          assetConversationLabel,
          rawMessage.normalizedFields?.messageDate,
          rawMessage.sentAt,
          rawMessage.normalizedFields?.attachment
        ),
        stageLabel: 'raw',
        reviewStage: 'raw',
        reviewStageId: rawMessage.externalId
      })
    );
  }

  private buildImageUrl(
    assetConversationLabel: string,
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

    const relativePath = `WhatsApp - ${assetConversationLabel}/${formattedDate} - ${assetConversationLabel} - ${trimmedAttachment}`;
    return this.toNormalizedHttpUrl(
      this.frontendSecretsService.staticAssetsBaseUrl,
      relativePath
    );
  }

  private resolveAssetConversationLabel(document: BackendConversationDocument): string {
    const contactName = this.toNonEmptyString(document.contactName);
    if (contactName) {
      return contactName;
    }

    const sourceFile = this.toNonEmptyString(document.sourceFile);
    if (sourceFile) {
      const fileName = sourceFile.split(/[\\/]/).pop() ?? sourceFile;
      const extractedLabel = fileName
        .replace(/\.csv$/i, '')
        .replace(/^whatsapp\s*-\s*/i, '')
        .trim();

      if (extractedLabel.length > 0) {
        return extractedLabel;
      }
    }

    return document._id;
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
