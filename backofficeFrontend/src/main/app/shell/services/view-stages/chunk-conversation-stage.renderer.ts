import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import {
  buildRawSentAtMap,
  resolveSentAtFromMessageIds
} from './conversation-stage-renderer.utils';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class ChunkConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'chunk' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);

  render(document: BackendConversationDocument): ChatMessage[] {
    const sentAtByMessageId = buildRawSentAtMap(document);

    return (document.chunkedMessages ?? []).map((chunkMessage) => {
      const sentAt = resolveSentAtFromMessageIds(sentAtByMessageId, chunkMessage.messageIds);

      return this.messageBubbleFactory.createSystem({
        id: chunkMessage.chunkId,
        text: chunkMessage.chunkMessage,
        sentAt,
        stageLabel: 'chunk'
      });
    });
  }
}
