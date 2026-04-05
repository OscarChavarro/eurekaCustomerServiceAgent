import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class RawConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'raw' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);

  render(document: BackendConversationDocument): ChatMessage[] {
    return (document.rawMessages ?? []).map((rawMessage) =>
      this.messageBubbleFactory.createFromRaw(rawMessage, {
        stageLabel: 'raw',
        reviewStage: 'raw',
        reviewStageId: rawMessage.externalId
      })
    );
  }
}
