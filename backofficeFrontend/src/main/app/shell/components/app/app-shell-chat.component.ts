import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  ChatConversation,
  ChatConversationService,
  ChatMessage,
} from '../../services/chat-conversation.service';

@Component({
  selector: 'app-shell-chat',
  imports: [CommonModule],
  templateUrl: './app-shell-chat.component.html',
  styleUrl: './app-shell-chat.component.css',
})
export class AppShellChatComponent {
  private readonly chatConversationService = inject(ChatConversationService);
  private readonly searchTermState = signal<string>('');

  protected readonly conversations = this.chatConversationService.conversations;
  protected readonly activeConversation = this.chatConversationService.activeConversation;
  protected readonly activeConversationId = this.chatConversationService.activeConversationId;
  protected readonly filteredConversations = computed(() => {
    const normalizedSearchTerm = this.searchTermState().trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return this.conversations();
    }

    return this.conversations().filter((conversation) =>
      conversation.id.toLowerCase().includes(normalizedSearchTerm)
    );
  });

  protected setSearchTerm(searchTerm: string): void {
    this.searchTermState.set(searchTerm);
  }

  protected selectConversation(conversationId: string): void {
    this.chatConversationService.setActiveConversation(conversationId);
  }

  protected trackByConversation(_: number, conversation: ChatConversation): string {
    return conversation.id;
  }

  protected trackByMessage(_: number, message: ChatMessage): string {
    return message.id;
  }
}
