import { Injectable, inject } from '@angular/core';

import type {
  BackendConversationDocument,
  BackendConversationRawMessage
} from '../../../core/api/services/conversations-api.service';
import { FrontendSecretsService } from '../../../core/api/services/frontend-secrets.service';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId
} from '../../../core/phone/phone-normalization.utils';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class RawConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'raw' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);
  private readonly frontendSecretsService = inject(FrontendSecretsService);
  private readonly imageExtensions = new Set(['jpg', 'jpeg', 'gif', 'webp', 'png']);
  private readonly audioExtensions = new Set(['opus', 'mp3', 'm2a', 'm4a']);

  render(document: BackendConversationDocument): ChatMessage[] {
    const assetFolderName = this.resolveAssetFolderNameFromConversationId(document._id);

    return (document.rawMessages ?? []).map((rawMessage) =>
      this.messageBubbleFactory.createFromRaw(rawMessage, {
        text: rawMessage.text,
        mediaUrl: this.resolveMediaUrl(rawMessage, assetFolderName),
        audioFileName: this.resolveAudioAttachmentName(rawMessage.normalizedFields?.attachment),
        audioResourceUrl: this.resolveAudioResourceUrl(rawMessage, assetFolderName),
        audioTranscription: this.resolveAudioTranscription(rawMessage.audioDetails),
        audioWaveBars: this.resolveAudioWaveBars(rawMessage.audioDetails),
        stageLabel: 'raw',
        reviewStage: 'raw',
        reviewStageId: rawMessage.externalId
      })
    );
  }

  private resolveMediaUrl(
    rawMessage: BackendConversationRawMessage,
    assetFolderName: string | null
  ): string | undefined {
    const directCandidate = this.toOptionalString(rawMessage.normalizedFields?.['assetUrl']);
    if (directCandidate && this.isLikelyResourceUrl(directCandidate) && this.isImageAttachment(directCandidate)) {
      return directCandidate;
    }

    const attachmentCandidate = this.toOptionalString(rawMessage.normalizedFields?.attachment);
    if (!attachmentCandidate) {
      return undefined;
    }

    if (this.isLikelyResourceUrl(attachmentCandidate) && this.isImageAttachment(attachmentCandidate)) {
      return attachmentCandidate;
    }

    const attachmentFileName = this.resolveAttachmentFileName(attachmentCandidate);
    if (!this.isImageAttachment(attachmentFileName)) {
      return undefined;
    }

    if (!assetFolderName) {
      return undefined;
    }

    const formattedDate = this.formatAssetDate(rawMessage.normalizedFields?.messageDate, rawMessage.sentAt);
    if (!formattedDate) {
      return undefined;
    }

    const relativePath = `${assetFolderName}/${formattedDate} - ${attachmentFileName}`;
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
    assetFolderName: string | null
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

    if (!assetFolderName) {
      return undefined;
    }

    const formattedDate = this.formatAssetDate(rawMessage.normalizedFields?.messageDate, rawMessage.sentAt);
    if (!formattedDate) {
      return undefined;
    }

    const relativePath = `${assetFolderName}/${formattedDate} - ${attachmentFileName}`;
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

  private resolveAssetFolderNameFromConversationId(conversationId: unknown): string | null {
    if (typeof conversationId !== 'string') {
      return null;
    }

    const normalizedConversationId = normalizeConversationSourceId(conversationId);
    if (!normalizedConversationId) {
      return null;
    }

    const canonicalPhone = canonicalizePhoneNumber(normalizedConversationId);
    if (canonicalPhone?.digitsOnly) {
      return canonicalPhone.digitsOnly;
    }

    const digitsOnly = normalizedConversationId.replace(/\D+/g, '');
    return digitsOnly.length > 0 ? digitsOnly : null;
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
