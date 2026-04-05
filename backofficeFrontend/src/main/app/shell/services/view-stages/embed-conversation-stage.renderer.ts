import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt } from './conversation-stage-renderer.utils';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class EmbedConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'embed' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);

  render(document: BackendConversationDocument): ChatMessage[] {
    const lastRawMessage = document.rawMessages?.[document.rawMessages.length - 1];

    return [
      this.messageBubbleFactory.createSystem({
        id: `embed-${document._id}`,
        text: 'Vista embed pendiente de implementacion.',
        sentAt: lastRawMessage?.sentAt ? formatSentAt(lastRawMessage.sentAt) : 'Sin fecha',
        stageLabel: 'embed'
      })
    ];
  }
}
