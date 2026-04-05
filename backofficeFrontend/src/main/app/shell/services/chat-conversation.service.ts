import { Injectable, computed, effect, inject, signal } from '@angular/core';

import {
  BackendConversationSummary,
  BackendConversationDocument,
  ConversationsApiService
} from '../../core/api/services/conversations-api.service';
import { I18nStateService } from '../../core/i18n/services/i18n-state.service';
import { ChunkConversationStageRenderer } from './view-stages/chunk-conversation-stage.renderer';
import { CleanConversationStageRenderer } from './view-stages/clean-conversation-stage.renderer';
import type { ConversationStageRenderer } from './view-stages/conversation-stage-renderer.interface';
import { formatDateLabel, formatSentAt } from './view-stages/conversation-stage-renderer.utils';
import { EmbedConversationStageRenderer } from './view-stages/embed-conversation-stage.renderer';
import { RawConversationStageRenderer } from './view-stages/raw-conversation-stage.renderer';
import { StructureConversationStageRenderer } from './view-stages/structure-conversation-stage.renderer';
import type { ChatMessage, ConversationViewMode } from './view-stages/conversation-view.types';

export type { ChatMessage, ConversationViewMode };

export interface ChatConversation {
  id: string;
  contactName: string;
  contactAvatar: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: ChatMessage[];
}

@Injectable({ providedIn: 'root' })
export class ChatConversationService {
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly rawConversationStageRenderer = inject(RawConversationStageRenderer);
  private readonly cleanConversationStageRenderer = inject(CleanConversationStageRenderer);
  private readonly structureConversationStageRenderer = inject(StructureConversationStageRenderer);
  private readonly chunkConversationStageRenderer = inject(ChunkConversationStageRenderer);
  private readonly embedConversationStageRenderer = inject(EmbedConversationStageRenderer);

  private readonly loadedMessagesConversationIds = new Set<string>();
  private readonly conversationDocumentsState = signal<Record<string, BackendConversationDocument>>({});
  private readonly conversationSummariesState = signal<Record<string, BackendConversationSummary>>({});
  private readonly viewModeState = signal<ConversationViewMode>('raw');

  private readonly stageRenderers: Record<ConversationViewMode, ConversationStageRenderer> = {
    raw: this.rawConversationStageRenderer,
    clean: this.cleanConversationStageRenderer,
    structure: this.structureConversationStageRenderer,
    chunk: this.chunkConversationStageRenderer,
    embed: this.embedConversationStageRenderer
  };

  private readonly mockConversationById: Record<string, ChatConversation> = {
    'conv-ana': {
      id: 'conv-ana',
      contactName: 'Ana Ruiz',
      contactAvatar: 'AR',
      lastMessagePreview: 'Perfecto, hoy a las 17:00 te envio los documentos.',
      lastMessageAt: formatSentAt('2026-04-05T17:02:00', this.i18nStateService.selectedLanguage()),
      unreadCount: 2,
      messages: [
        {
          id: 'ana-1',
          direction: 'incoming',
          text: 'Hola, tengo dudas con la poliza de mi vivienda.',
          sentAt: formatSentAt('2026-04-05T16:45:00', this.i18nStateService.selectedLanguage())
        },
        {
          id: 'ana-2',
          direction: 'outgoing',
          text: 'Claro, te ayudo. Quieres revisar coberturas o fechas?',
          sentAt: formatSentAt('2026-04-05T16:47:00', this.i18nStateService.selectedLanguage()),
          status: 'read'
        }
      ]
    }
  };

  private readonly defaultMockMessages: ChatMessage[] = [
    {
      id: 'default-1',
      direction: 'incoming',
      text: 'Conversacion sincronizada desde backend.',
      sentAt: formatSentAt(new Date().toISOString(), this.i18nStateService.selectedLanguage())
    }
  ];

  private readonly conversationState = signal<ChatConversation[]>([]);
  private readonly activeConversationIdState = signal<string | null>(null);

  readonly conversations = this.conversationState.asReadonly();
  readonly activeConversationId = this.activeConversationIdState.asReadonly();
  readonly viewMode = this.viewModeState.asReadonly();

  readonly activeConversation = computed(() => {
    const activeId = this.activeConversationIdState();

    if (!activeId) {
      return undefined;
    }

    return this.conversationState().find((conversation) => conversation.id === activeId);
  });

  constructor() {
    effect(
      () => {
        this.i18nStateService.selectedLanguage();
        this.refreshConversationSummaries();
        this.rerenderLoadedConversations();
      },
      { allowSignalWrites: true }
    );

    this.loadConversationIds();
  }

  setActiveConversation(conversationId: string): void {
    this.activeConversationIdState.set(conversationId);
    this.loadConversationMessages(conversationId);
  }

  setViewMode(viewMode: ConversationViewMode): void {
    if (this.viewModeState() === viewMode) {
      return;
    }

    this.viewModeState.set(viewMode);
    this.rerenderLoadedConversations();
  }

  private loadConversationIds(): void {
    this.conversationsApiService.getConversationIds().subscribe({
      next: (summaries) => {
        this.conversationSummariesState.set(
          Object.fromEntries(summaries.map((summary) => [summary.id, summary]))
        );
        const normalizedConversations = this.sortConversationsByRecency(
          summaries.map((summary) => this.buildConversation(summary))
        );

        this.conversationState.set(normalizedConversations);

        const currentActiveId = this.activeConversationIdState();
        const hasCurrentActiveConversation =
          !!currentActiveId && normalizedConversations.some((conversation) => conversation.id === currentActiveId);

        if (!hasCurrentActiveConversation) {
          const firstConversationId = normalizedConversations[0]?.id ?? null;
          this.activeConversationIdState.set(firstConversationId);

          if (firstConversationId) {
            this.loadConversationMessages(firstConversationId);
          }
        }
      },
      error: (error: unknown) => {
        console.error('Unable to load conversations from backend /conversations', error);
        this.conversationState.set([]);
        this.activeConversationIdState.set(null);
      }
    });
  }

  private buildConversation(summary: BackendConversationSummary): ChatConversation {
    const conversationId = summary.id;
    const predefinedMock = this.mockConversationById[conversationId];

    if (predefinedMock) {
      return predefinedMock;
    }

    const avatar = this.buildAvatarFromId(conversationId);

    return {
      id: conversationId,
      contactName: conversationId,
      contactAvatar: avatar,
      lastMessagePreview: summary.msg ?? 'Conversacion cargada desde backend.',
      lastMessageAt: formatDateLabel(summary.date, this.i18nStateService.selectedLanguage()),
      unreadCount: 0,
      messages: this.defaultMockMessages
    };
  }

  private loadConversationMessages(conversationId: string): void {
    if (this.loadedMessagesConversationIds.has(conversationId)) {
      return;
    }

    this.conversationsApiService.getConversationById(conversationId).subscribe({
      next: (conversationDocument) => {
        this.conversationDocumentsState.update((currentDocuments) => ({
          ...currentDocuments,
          [conversationId]: conversationDocument
        }));

        this.loadedMessagesConversationIds.add(conversationId);
        this.applyConversationDocumentToState(conversationId, conversationDocument);
      },
      error: (error: unknown) => {
        console.error(`Unable to load messages from backend /messages for id=${conversationId}`, error);
      }
    });
  }

  private applyConversationDocumentToState(
    conversationId: string,
    conversationDocument: BackendConversationDocument
  ): void {
    const renderer = this.stageRenderers[this.viewModeState()];
    const renderedMessages = renderer.render(conversationDocument);
    const fallbackMessages = renderedMessages.length > 0 ? renderedMessages : this.defaultMockMessages;
    const lastRawMessage = conversationDocument.rawMessages?.[conversationDocument.rawMessages.length - 1];
    const summary = this.conversationSummariesState()[conversationId];
    const language = this.i18nStateService.selectedLanguage();

    this.conversationState.update((conversations) =>
      this.sortConversationsByRecency(conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: fallbackMessages,
          lastMessagePreview:
            lastRawMessage?.text ?? summary?.msg ?? conversation.lastMessagePreview,
          lastMessageAt: lastRawMessage?.sentAt
            ? formatSentAt(lastRawMessage.sentAt, language)
            : formatDateLabel(summary?.date, language)
        };
      }))
    );
  }

  private rerenderLoadedConversations(): void {
    const conversationDocuments = this.conversationDocumentsState();
    const renderer = this.stageRenderers[this.viewModeState()];

    this.conversationState.update((conversations) =>
      this.sortConversationsByRecency(conversations.map((conversation) => {
        const conversationDocument = conversationDocuments[conversation.id];

        if (!conversationDocument) {
          return conversation;
        }

        const renderedMessages = renderer.render(conversationDocument);

        return {
          ...conversation,
          messages: renderedMessages.length > 0 ? renderedMessages : this.defaultMockMessages
        };
      }))
    );
  }

  private refreshConversationSummaries(): void {
    const summaries = this.conversationSummariesState();
    const language = this.i18nStateService.selectedLanguage();

    this.conversationState.update((conversations) =>
      this.sortConversationsByRecency(conversations.map((conversation) => {
        const summary = summaries[conversation.id];

        if (!summary) {
          return conversation;
        }

        return {
          ...conversation,
          lastMessagePreview: summary.msg ?? conversation.lastMessagePreview,
          lastMessageAt: formatDateLabel(summary.date, language)
        };
      }))
    );
  }

  private sortConversationsByRecency(conversations: ChatConversation[]): ChatConversation[] {
    return [...conversations].sort((left, right) => {
      const leftTimestamp = this.getConversationRecencyTimestamp(left.id);
      const rightTimestamp = this.getConversationRecencyTimestamp(right.id);

      if (leftTimestamp === rightTimestamp) {
        return left.id.localeCompare(right.id);
      }

      return rightTimestamp - leftTimestamp;
    });
  }

  private getConversationRecencyTimestamp(conversationId: string): number {
    const document = this.conversationDocumentsState()[conversationId];
    const lastRawMessage = document?.rawMessages?.[document.rawMessages.length - 1];

    if (lastRawMessage?.sentAt) {
      return this.toTimestamp(lastRawMessage.sentAt);
    }

    const summaryDate = this.conversationSummariesState()[conversationId]?.date;
    return summaryDate ? this.toTimestamp(summaryDate) : 0;
  }

  private toTimestamp(rawDate: string): number {
    const normalizedDate =
      rawDate.includes(' ') && !rawDate.includes('T') ? rawDate.replace(' ', 'T') : rawDate;
    const timestamp = new Date(normalizedDate).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private buildAvatarFromId(conversationId: string): string {
    const alphanumeric = conversationId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (alphanumeric.length >= 2) {
      return alphanumeric.slice(0, 2);
    }

    if (alphanumeric.length === 1) {
      return `${alphanumeric}X`;
    }

    return 'ID';
  }
}
