import { Injectable, inject } from '@angular/core';

import type {
  BackendConversationDocument,
  BackendConversationRawMessage
} from '../../../core/api/services/conversations-api.service';
import { FrontendSecretsService } from '../../../core/api/services/frontend-secrets.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class NormalizeConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'normalize' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);
  private readonly frontendSecretsService = inject(FrontendSecretsService);
  private readonly imageExtensions = new Set(['jpg', 'jpeg', 'gif', 'webp', 'png']);
  private readonly audioExtensions = new Set(['opus', 'mp3', 'm2a', 'm4a']);
  private static readonly WHATSAPP_PREFIX = /^whatsapp\s*-\s*/i;

  render(document: BackendConversationDocument): ChatMessage[] {
    const normalizedByExternalId = new Map<string, BackendConversationRawMessage>();
    const conversationFilePattern = this.resolveConversationFilePattern(document.filePattern);

    (document.normalizedMessages ?? []).forEach((normalizedMessage) => {
      normalizedByExternalId.set(normalizedMessage.externalId, normalizedMessage);
    });

    return (document.rawMessages ?? []).map((rawMessage) => {
      const normalizedMessage = normalizedByExternalId.get(rawMessage.externalId) ?? rawMessage;

      return this.messageBubbleFactory.createFromRaw(normalizedMessage, {
        text: normalizedMessage.text,
        mediaUrl: this.resolveMediaUrl(normalizedMessage, conversationFilePattern),
        audioFileName: this.resolveAudioAttachmentName(normalizedMessage.normalizedFields?.attachment),
        audioResourceUrl: this.resolveAudioResourceUrl(normalizedMessage, conversationFilePattern),
        audioTranscription: this.resolveAudioTranscription(normalizedMessage.audioDetails),
        audioWaveBars: this.resolveAudioWaveBars(normalizedMessage.audioDetails),
        stageLabel: 'normalize',
        reviewStage: 'normalize',
        reviewStageId: normalizedMessage.externalId
      });
    });
  }

  private resolveMediaUrl(
    rawMessage: BackendConversationRawMessage,
    conversationFilePattern: string | null
  ): string | undefined {
    const directCandidate = this.toOptionalString(rawMessage.normalizedFields?.['assetUrl']);
    if (this.isLikelyResourceUrl(directCandidate)) {
      return directCandidate;
    }

    const attachmentCandidate = this.toOptionalString(rawMessage.normalizedFields?.attachment);
    if (!attachmentCandidate) {
      return undefined;
    }

    if (this.isLikelyResourceUrl(attachmentCandidate)) {
      return attachmentCandidate;
    }

    const attachmentFileName = this.resolveAttachmentFileName(attachmentCandidate);
    if (!this.isImageAttachment(attachmentFileName)) {
      return undefined;
    }

    const effectivePattern = conversationFilePattern ?? this.resolveConversationFilePattern(rawMessage.filePattern);
    if (!effectivePattern) {
      return undefined;
    }

    const formattedDate = this.formatAssetDate(rawMessage.normalizedFields?.messageDate, rawMessage.sentAt);
    if (!formattedDate) {
      return undefined;
    }

    const assetConversation = this.resolveAssetConversationFromPattern(effectivePattern);
    const relativePath = `${assetConversation.folderName}/${formattedDate} - ${assetConversation.label} - ${attachmentFileName}`;
    return this.toNormalizedHttpUrl(this.frontendSecretsService.staticAssetsBaseUrl, relativePath);
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private resolveAudioAttachmentName(attachment: unknown): string | undefined {
    const normalizedAttachment = this.toOptionalString(attachment);
    if (!normalizedAttachment) {
      return undefined;
    }

    const fileName = this.resolveAttachmentFileName(normalizedAttachment);
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || !this.audioExtensions.has(extension)) {
      return undefined;
    }

    return fileName;
  }

  private resolveAudioResourceUrl(
    rawMessage: BackendConversationRawMessage,
    conversationFilePattern: string | null
  ): string | undefined {
    const directCandidate = this.toOptionalString(rawMessage.filePattern)
      ?? this.toOptionalString(rawMessage.normalizedFields?.['filePattern'])
      ?? this.toOptionalString(rawMessage.normalizedFields?.['audioResourceUrl']);

    if (this.isLikelyResourceUrl(directCandidate)) {
      return directCandidate;
    }

    const attachmentCandidate = this.toOptionalString(rawMessage.normalizedFields?.attachment);
    if (!attachmentCandidate) {
      return undefined;
    }

    if (this.isLikelyResourceUrl(attachmentCandidate)) {
      return attachmentCandidate;
    }

    const attachmentFileName = this.resolveAttachmentFileName(attachmentCandidate);
    if (!this.isAudioAttachment(attachmentFileName)) {
      return undefined;
    }

    const effectivePattern = conversationFilePattern ?? this.resolveConversationFilePattern(rawMessage.filePattern);
    if (!effectivePattern) {
      return undefined;
    }

    const formattedDate = this.formatAssetDate(rawMessage.normalizedFields?.messageDate, rawMessage.sentAt);
    if (!formattedDate) {
      return undefined;
    }

    const assetConversation = this.resolveAssetConversationFromPattern(effectivePattern);
    const relativePath = `${assetConversation.folderName}/${formattedDate} - ${assetConversation.label} - ${attachmentFileName}`;
    return this.toNormalizedHttpUrl(this.frontendSecretsService.staticAssetsBaseUrl, relativePath);
  }

  private resolveAudioTranscription(
    audioDetails:
      | {
        type?: string | null;
        transcription?: string | null;
      }
      | null
      | undefined
  ): string | undefined {
    if (!audioDetails || audioDetails.type !== 'voice') {
      return undefined;
    }

    const transcription = audioDetails.transcription?.trim();
    return transcription && transcription.length > 0 ? transcription : undefined;
  }

  private resolveAudioWaveBars(
    audioDetails:
      | {
        bars?: number[] | null;
      }
      | null
      | undefined
  ): number[] | undefined {
    if (!audioDetails || !Array.isArray(audioDetails.bars)) {
      return undefined;
    }

    const normalizedBars = audioDetails.bars
      .filter((bar): bar is number => Number.isFinite(bar))
      .map((bar) => Math.max(0, Math.min(100, Math.round(bar))));

    return normalizedBars.length > 0 ? normalizedBars : undefined;
  }

  private resolveAttachmentFileName(value: string): string {
    const withoutHash = value.split('#')[0] ?? value;
    const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
    const tail = withoutQuery.split('/').pop()?.trim();
    return tail && tail.length > 0 ? tail : withoutQuery.trim();
  }

  private isAudioAttachment(attachment: string): boolean {
    const extension = this.resolveAttachmentFileName(attachment).split('.').pop()?.toLowerCase();
    return !!extension && this.audioExtensions.has(extension);
  }

  private isImageAttachment(attachment: string): boolean {
    const extension = this.resolveAttachmentFileName(attachment).split('.').pop()?.toLowerCase();
    return !!extension && this.imageExtensions.has(extension);
  }

  private resolveConversationFilePattern(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed || this.isLikelyResourceUrl(trimmed)) {
      return null;
    }

    if (NormalizeConversationStageRenderer.WHATSAPP_PREFIX.test(trimmed)) {
      const label = trimmed.replace(NormalizeConversationStageRenderer.WHATSAPP_PREFIX, '').trim();
      return label ? `WhatsApp - ${label}` : null;
    }

    return `WhatsApp - ${trimmed}`;
  }

  private resolveAssetConversationFromPattern(filePattern: string): {
    folderName: string;
    label: string;
  } {
    const label = this.extractConversationLabelFromPattern(filePattern);
    const folderName = filePattern.startsWith('WhatsApp - ')
      ? filePattern
      : `WhatsApp - ${label}`;

    return { folderName, label };
  }

  private extractConversationLabelFromPattern(pattern: string): string {
    const label = pattern.replace(NormalizeConversationStageRenderer.WHATSAPP_PREFIX, '').trim();
    return label.length > 0 ? label : pattern.trim();
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

  private isLikelyResourceUrl(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const normalized = value.trim();
    return normalized.startsWith('http://')
      || normalized.startsWith('https://')
      || normalized.startsWith('/')
      || normalized.startsWith('./')
      || normalized.startsWith('../');
  }
}
