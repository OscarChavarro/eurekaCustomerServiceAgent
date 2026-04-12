import { Injectable } from '@angular/core';

import type { ChatConversation } from './chat-conversation.service';

@Injectable({ providedIn: 'root' })
export class ChatConversationCyclerService {
  public resolvePreviousConversationId(
    conversations: ChatConversation[],
    activeConversationId: string | null
  ): string | null {
    if (conversations.length === 0) {
      return null;
    }

    if (!activeConversationId) {
      return conversations[0]?.id ?? null;
    }

    const activeIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    const previousIndex = activeIndex <= 0 ? conversations.length - 1 : activeIndex - 1;
    const previousConversation = conversations[previousIndex];

    return previousConversation?.id ?? null;
  }

  public resolveNextConversationId(
    conversations: ChatConversation[],
    activeConversationId: string | null
  ): string | null {
    if (conversations.length === 0) {
      return null;
    }

    if (!activeConversationId) {
      return conversations[0]?.id ?? null;
    }

    const activeIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    const nextIndex = activeIndex < 0 || activeIndex >= conversations.length - 1 ? 0 : activeIndex + 1;
    const nextConversation = conversations[nextIndex];

    return nextConversation?.id ?? null;
  }
}

