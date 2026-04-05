import { Injectable, inject } from '@angular/core';

import type {
  BackendConversationCleanMessage,
  BackendConversationDocument
} from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class CleanConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'clean' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);

  render(document: BackendConversationDocument): ChatMessage[] {
    const cleanByExternalId = new Map<string, BackendConversationCleanMessage>();

    (document.cleanedMessages ?? []).forEach((cleanMessage) => {
      cleanByExternalId.set(cleanMessage.externalId, cleanMessage);
    });

    return (document.rawMessages ?? []).map((rawMessage) => {
      const cleanMessage = cleanByExternalId.get(rawMessage.externalId);
      const hasDifferentCleanText =
        !!cleanMessage &&
        this.normalizeForComparison(cleanMessage.text) !==
          this.normalizeForComparison(rawMessage.text);
      const messageText = hasDifferentCleanText ? cleanMessage.text : rawMessage.text;
      const messageDirection = cleanMessage?.direction ?? rawMessage.direction;

      return this.messageBubbleFactory.createFromRaw(rawMessage, {
        directionRaw: messageDirection,
        text: messageText,
        stageLabel: 'clean',
        rawText: hasDifferentCleanText ? rawMessage.text : undefined,
        showRawStrikethrough: hasDifferentCleanText
      });
    });
  }

  private normalizeForComparison(text: string): string {
    return text
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
