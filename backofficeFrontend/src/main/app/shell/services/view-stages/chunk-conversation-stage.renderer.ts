import { Injectable } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import {
  buildRawSentAtMap,
  resolveSentAtFromMessageIds
} from './conversation-stage-renderer.utils';

@Injectable({ providedIn: 'root' })
export class ChunkConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'chunk' as const;

  render(document: BackendConversationDocument): ChatMessage[] {
    const sentAtByMessageId = buildRawSentAtMap(document);

    return (document.chunkedMessages ?? []).map((chunkMessage) => {
      const sentAt = resolveSentAtFromMessageIds(sentAtByMessageId, chunkMessage.messageIds);

      return {
        id: chunkMessage.chunkId,
        direction: 'system',
        text: chunkMessage.chunkMessage,
        sentAt,
        stageLabel: 'Chunk'
      };
    });
  }
}
