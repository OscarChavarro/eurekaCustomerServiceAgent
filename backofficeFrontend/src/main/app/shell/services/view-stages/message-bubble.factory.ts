import { Injectable, inject } from '@angular/core';

import type { BackendConversationRawMessage } from '../../../core/api/services/conversations-api.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import {
  formatDateLabel,
  formatSentAt,
  mapDirectionFromAgentPerspective
} from './conversation-stage-renderer.utils';
import type { ChatMessage, MessageReviewStage } from './conversation-view.types';

type CreateFromRawOverrides = {
  directionRaw?: string;
  text?: string;
  mediaUrl?: string;
  audioFileName?: string;
  audioResourceUrl?: string;
  audioTranscription?: string;
  audioWaveBars?: number[];
  stageLabel?: string;
  backgroundColor?: string;
  rawText?: string;
  showRawStrikethrough?: boolean;
  reviewStage?: MessageReviewStage;
  reviewStageId?: string;
};

type CreateSystemParams = {
  id: string;
  text: string;
  sentAt: string;
  stageLabel?: string;
  backgroundColor?: string;
  reviewStage?: MessageReviewStage;
  reviewStageId?: string;
};

@Injectable({ providedIn: 'root' })
export class MessageBubbleFactory {
  private readonly i18nStateService = inject(I18nStateService);

  createFromRaw(
    rawMessage: BackendConversationRawMessage,
    overrides: CreateFromRawOverrides = {}
  ): ChatMessage {
    return {
      id: rawMessage.externalId,
      direction: mapDirectionFromAgentPerspective(overrides.directionRaw ?? rawMessage.direction),
      text: overrides.text ?? rawMessage.text,
      sentAt: rawMessage.sentAt
        ? formatSentAt(rawMessage.sentAt, this.i18nStateService.selectedLanguage())
        : formatDateLabel(null, this.i18nStateService.selectedLanguage()),
      stageLabel: overrides.stageLabel,
      backgroundColor: overrides.backgroundColor,
      rawText: overrides.rawText,
      showRawStrikethrough: overrides.showRawStrikethrough,
      mediaUrl: overrides.mediaUrl,
      audioFileName: overrides.audioFileName,
      audioResourceUrl: overrides.audioResourceUrl,
      audioTranscription: overrides.audioTranscription,
      audioWaveBars: overrides.audioWaveBars,
      reviewStage: overrides.reviewStage,
      reviewStageId: overrides.reviewStageId
    };
  }

  createSystem(params: CreateSystemParams): ChatMessage {
    return {
      id: params.id,
      direction: 'system',
      text: params.text,
      sentAt: params.sentAt,
      stageLabel: params.stageLabel,
      backgroundColor: params.backgroundColor,
      reviewStage: params.reviewStage,
      reviewStageId: params.reviewStageId
    };
  }
}
