import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import type { SupportedLanguage } from '../../../core/i18n/types/supported-language.type';
import {
  ChatConversation,
  ChatConversationService,
  ChatMessage,
  ConversationViewMode,
} from '../../services/chat-conversation.service';

@Component({
  selector: 'app-shell-chat',
  imports: [CommonModule],
  templateUrl: './app-shell-chat.component.html',
  styleUrl: './app-shell-chat.component.css',
})
export class AppShellChatComponent {
  private readonly chatConversationService = inject(ChatConversationService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly searchTermState = signal<string>('');
  private readonly languageDropdownOpenState = signal<boolean>(false);
  private readonly messageTextSegmentsCache = new Map<string, MessageTextSegment[]>();

  protected readonly conversations = this.chatConversationService.conversations;
  protected readonly activeConversation = this.chatConversationService.activeConversation;
  protected readonly activeConversationId = this.chatConversationService.activeConversationId;
  protected readonly viewMode = this.chatConversationService.viewMode;
  protected readonly selectedLanguage = this.i18nStateService.selectedLanguage;
  protected readonly availableLanguages: SupportedLanguage[] = ['es', 'en'];
  protected readonly selectedLanguageFlag = computed(() =>
    this.getLanguageFlag(this.selectedLanguage())
  );
  protected readonly languageDropdownOpen = this.languageDropdownOpenState.asReadonly();
  protected readonly availableViewModes: ConversationViewMode[] = [
    'raw',
    'clean',
    'structure',
    'chunk',
    'embed',
  ];
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

  protected toggleLanguageDropdown(): void {
    this.languageDropdownOpenState.update((isOpen) => !isOpen);
  }

  protected selectLanguage(language: SupportedLanguage): void {
    this.i18nStateService.setLanguage(language);
    this.languageDropdownOpenState.set(false);
  }

  protected languageButtonAriaLabel(): string {
    return this.t(I18N_KEYS.shell.LANGUAGE_SELECTOR_ARIA);
  }

  protected languageOptionLabel(language: SupportedLanguage): string {
    if (language === 'es') {
      return `${this.t(I18N_KEYS.shell.LANGUAGE_ES)} ${this.getLanguageFlag(language)}`;
    }

    return `${this.t(I18N_KEYS.shell.LANGUAGE_EN)} ${this.getLanguageFlag(language)}`;
  }

  protected viewModeLabel(viewMode: ConversationViewMode): string {
    if (viewMode === 'raw') {
      return this.t(I18N_KEYS.shell.STAGE_RAW);
    }

    if (viewMode === 'clean') {
      return this.t(I18N_KEYS.shell.STAGE_CLEAN);
    }

    if (viewMode === 'structure') {
      return this.t(I18N_KEYS.shell.STAGE_STRUCTURE);
    }

    if (viewMode === 'chunk') {
      return this.t(I18N_KEYS.shell.STAGE_CHUNK);
    }

    return this.t(I18N_KEYS.shell.STAGE_EMBED);
  }

  protected conversationsTitle(): string {
    return `${this.t(I18N_KEYS.shell.CONVERSATIONS_TITLE)} (${this.filteredConversations().length})`;
  }

  protected onlineStatusLabel(): string {
    return this.t(I18N_KEYS.shell.ONLINE_STATUS);
  }

  protected searchOrNewChatPlaceholder(): string {
    return this.t(I18N_KEYS.shell.SEARCH_OR_NEW_CHAT_PLACEHOLDER);
  }

  protected writeMessagePlaceholder(): string {
    return this.t(I18N_KEYS.shell.WRITE_MESSAGE_PLACEHOLDER);
  }

  protected stageLabel(stageLabel: string | undefined): string {
    if (!stageLabel) {
      return '';
    }

    if (stageLabel === 'raw') {
      return this.t(I18N_KEYS.shell.STAGE_RAW);
    }

    if (stageLabel === 'clean') {
      return this.t(I18N_KEYS.shell.STAGE_CLEAN);
    }

    if (stageLabel === 'structure') {
      return this.t(I18N_KEYS.shell.STAGE_STRUCTURE);
    }

    if (stageLabel === 'chunk') {
      return this.t(I18N_KEYS.shell.STAGE_CHUNK);
    }

    if (stageLabel === 'embed') {
      return this.t(I18N_KEYS.shell.STAGE_EMBED);
    }

    return stageLabel;
  }

  protected selectConversation(conversationId: string): void {
    this.chatConversationService.setActiveConversation(conversationId);
  }

  protected selectViewMode(viewMode: ConversationViewMode): void {
    this.chatConversationService.setViewMode(viewMode);
  }

  protected trackByConversation(_: number, conversation: ChatConversation): string {
    return conversation.id;
  }

  protected trackByMessage(_: number, message: ChatMessage): string {
    return message.id;
  }

  protected getMessageTextSegments(text: string | undefined): MessageTextSegment[] {
    if (!text) {
      return [];
    }

    const cached = this.messageTextSegmentsCache.get(text);

    if (cached) {
      return cached;
    }

    const segments = splitMessageTextIntoSegments(text);
    this.messageTextSegmentsCache.set(text, segments);

    return segments;
  }

  protected trackByTextSegment(index: number): number {
    return index;
  }

  private t(key: (typeof I18N_KEYS)['shell'][keyof (typeof I18N_KEYS)['shell']]): string {
    return this.i18nService.get(key, this.selectedLanguage());
  }

  private getLanguageFlag(language: SupportedLanguage): string {
    return language === 'es' ? '🇪🇸' : '🇺🇸';
  }
}

type MessageTextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

function splitMessageTextIntoSegments(text: string): MessageTextSegment[] {
  const pattern = /\b((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const segments: MessageTextSegment[] = [];
  let currentIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > currentIndex) {
      segments.push({
        type: 'text',
        value: text.slice(currentIndex, startIndex)
      });
    }

    const normalizedUrl = normalizeMatchedUrl(fullMatch);
    const trailingSuffix = fullMatch.slice(normalizedUrl.length);
    const href = normalizedUrl.startsWith('http') ? normalizedUrl : `https://${normalizedUrl}`;

    segments.push({
      type: 'link',
      value: normalizedUrl,
      href
    });

    if (trailingSuffix) {
      segments.push({
        type: 'text',
        value: trailingSuffix
      });
    }

    currentIndex = startIndex + fullMatch.length;
  }

  if (currentIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(currentIndex)
    });
  }

  return segments;
}

function normalizeMatchedUrl(matchedUrl: string): string {
  return matchedUrl.replace(/[),.;!?]+$/, '');
}
