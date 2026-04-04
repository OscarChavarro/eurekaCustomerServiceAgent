import { Injectable } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt } from './conversation-stage-renderer.utils';

@Injectable({ providedIn: 'root' })
export class EmbedConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'embed' as const;

  render(document: BackendConversationDocument): ChatMessage[] {
    const lastRawMessage = document.rawMessages?.[document.rawMessages.length - 1];

    return [
      {
        id: `embed-${document._id}`,
        direction: 'system',
        text: 'Vista embed pendiente de implementacion.',
        sentAt: lastRawMessage?.sentAt ? formatSentAt(lastRawMessage.sentAt) : 'Sin fecha',
        stageLabel: 'Embed'
      }
    ];
  }
}
