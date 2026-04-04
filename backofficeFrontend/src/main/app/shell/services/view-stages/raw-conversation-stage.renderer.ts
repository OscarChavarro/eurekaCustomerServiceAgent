import { Injectable } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt, mapDirectionFromAgentPerspective } from './conversation-stage-renderer.utils';

@Injectable({ providedIn: 'root' })
export class RawConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'raw' as const;

  render(document: BackendConversationDocument): ChatMessage[] {
    return (document.rawMessages ?? []).map((rawMessage) => ({
      id: rawMessage.externalId,
      direction: mapDirectionFromAgentPerspective(rawMessage.direction),
      text: rawMessage.text,
      sentAt: formatSentAt(rawMessage.sentAt),
      stageLabel: 'Raw'
    }));
  }
}
