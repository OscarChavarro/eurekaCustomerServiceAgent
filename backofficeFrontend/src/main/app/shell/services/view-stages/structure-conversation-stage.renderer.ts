import { Injectable } from '@angular/core';

import type {
  BackendConversationCleanMessage,
  BackendConversationDocument
} from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt, mapDirectionFromAgentPerspective } from './conversation-stage-renderer.utils';

type GroupColors = {
  customer: string;
  agent: string;
};

@Injectable({ providedIn: 'root' })
export class StructureConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'structure' as const;

  private readonly palette: GroupColors[] = [
    { customer: '#ffb3b3', agent: '#ffe3e3' },
    { customer: '#b8f5b1', agent: '#e4fbe1' },
    { customer: '#b8d9ff', agent: '#e2efff' },
    { customer: '#ffe0a8', agent: '#fff1d7' },
    { customer: '#d6c1ff', agent: '#eee4ff' },
    { customer: '#ffd1e8', agent: '#ffe8f4' }
  ];

  render(document: BackendConversationDocument): ChatMessage[] {
    const cleanByExternalId = this.buildCleanByExternalId(document.cleanedMessages ?? []);
    const messageIdToGroupColors = this.buildMessageIdToGroupColors(document);

    return (document.rawMessages ?? []).map((rawMessage) => {
      const cleanMessage = cleanByExternalId.get(rawMessage.externalId);
      const directionSource = cleanMessage?.direction ?? rawMessage.direction;
      const direction = mapDirectionFromAgentPerspective(directionSource);
      const groupColors = messageIdToGroupColors.get(rawMessage.externalId);

      return {
        id: rawMessage.externalId,
        direction,
        text: cleanMessage?.text ?? rawMessage.text,
        sentAt: formatSentAt(rawMessage.sentAt),
        stageLabel: 'Structure',
        backgroundColor: this.resolveBackgroundColor(direction, groupColors)
      };
    });
  }

  private buildCleanByExternalId(
    cleanedMessages: BackendConversationCleanMessage[]
  ): Map<string, BackendConversationCleanMessage> {
    const cleanByExternalId = new Map<string, BackendConversationCleanMessage>();

    cleanedMessages.forEach((cleanMessage) => {
      cleanByExternalId.set(cleanMessage.externalId, cleanMessage);
    });

    return cleanByExternalId;
  }

  private buildMessageIdToGroupColors(document: BackendConversationDocument): Map<string, GroupColors> {
    const messageIdToGroupColors = new Map<string, GroupColors>();

    (document.structuredMessages ?? []).forEach((structuredMessage, index) => {
      const groupColors = this.palette[index % this.palette.length];

      structuredMessage.messageIds.forEach((messageId) => {
        messageIdToGroupColors.set(messageId, groupColors);
      });
    });

    return messageIdToGroupColors;
  }

  private resolveBackgroundColor(
    direction: ChatMessage['direction'],
    groupColors: GroupColors | undefined
  ): string | undefined {
    if (!groupColors) {
      return undefined;
    }

    if (direction === 'outgoing') {
      return groupColors.customer;
    }

    if (direction === 'incoming') {
      return groupColors.agent;
    }

    return undefined;
  }
}
