import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { formatSentAt } from './conversation-stage-renderer.utils';
import { MessageBubbleFactory } from './message-bubble.factory';

@Injectable({ providedIn: 'root' })
export class EmbedConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'embed' as const;
  private readonly messageBubbleFactory = inject(MessageBubbleFactory);
  private readonly i18nStateService = inject(I18nStateService);

  render(document: BackendConversationDocument): ChatMessage[] {
    const lastRawMessage = document.rawMessages?.[document.rawMessages.length - 1];
    const language = this.i18nStateService.selectedLanguage();

    return [
      this.messageBubbleFactory.createSystem({
        id: `embed-${document._id}`,
        text: 'Vista embed pendiente de implementacion.',
        sentAt: lastRawMessage?.sentAt
          ? formatSentAt(lastRawMessage.sentAt, language)
          : formatSentAt(new Date().toISOString(), language),
        stageLabel: 'embed'
      })
    ];
  }
}
