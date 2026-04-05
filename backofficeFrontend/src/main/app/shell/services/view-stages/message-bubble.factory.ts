import { Injectable } from '@angular/core';

import type { BackendConversationRawMessage } from '../../../core/api/services/conversations-api.service';
import {
  formatSentAt,
  mapDirectionFromAgentPerspective
} from './conversation-stage-renderer.utils';
import type { ChatMessage } from './conversation-view.types';

type CreateFromRawOverrides = {
  directionRaw?: string;
  text?: string;
  stageLabel?: string;
  backgroundColor?: string;
  rawText?: string;
  showRawStrikethrough?: boolean;
};

type CreateSystemParams = {
  id: string;
  text: string;
  sentAt: string;
  stageLabel?: string;
  backgroundColor?: string;
};

@Injectable({ providedIn: 'root' })
export class MessageBubbleFactory {
  createFromRaw(
    rawMessage: BackendConversationRawMessage,
    overrides: CreateFromRawOverrides = {}
  ): ChatMessage {
    return {
      id: rawMessage.externalId,
      direction: mapDirectionFromAgentPerspective(overrides.directionRaw ?? rawMessage.direction),
      text: overrides.text ?? rawMessage.text,
      sentAt: formatSentAt(rawMessage.sentAt),
      stageLabel: overrides.stageLabel,
      backgroundColor: overrides.backgroundColor,
      rawText: overrides.rawText,
      showRawStrikethrough: overrides.showRawStrikethrough
    };
  }

  createSystem(params: CreateSystemParams): ChatMessage {
    return {
      id: params.id,
      direction: 'system',
      text: params.text,
      sentAt: params.sentAt,
      stageLabel: params.stageLabel,
      backgroundColor: params.backgroundColor
    };
  }
}
