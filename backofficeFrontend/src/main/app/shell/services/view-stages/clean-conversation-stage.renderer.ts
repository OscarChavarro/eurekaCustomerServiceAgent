import { Injectable } from '@angular/core';

import type {
  BackendConversationCleanMessage,
  BackendConversationDocument
} from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt, mapDirectionFromAgentPerspective } from './conversation-stage-renderer.utils';

@Injectable({ providedIn: 'root' })
export class CleanConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'clean' as const;

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

      return {
        id: rawMessage.externalId,
        direction: mapDirectionFromAgentPerspective(messageDirection),
        text: messageText,
        sentAt: formatSentAt(rawMessage.sentAt),
        stageLabel: 'Clean',
        rawText: hasDifferentCleanText ? rawMessage.text : undefined,
        showRawStrikethrough: hasDifferentCleanText
      };
    });
  }

  private normalizeForComparison(text: string): string {
    return text
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
