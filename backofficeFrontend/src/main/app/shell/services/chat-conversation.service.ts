import { Injectable, computed, inject, signal } from '@angular/core';

import {
  BackendConversationDocument,
  ConversationsApiService
} from '../../core/api/services/conversations-api.service';
import { ChunkConversationStageRenderer } from './view-stages/chunk-conversation-stage.renderer';
import { CleanConversationStageRenderer } from './view-stages/clean-conversation-stage.renderer';
import type { ConversationStageRenderer } from './view-stages/conversation-stage-renderer.interface';
import { formatSentAt } from './view-stages/conversation-stage-renderer.utils';
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
  private readonly rawConversationStageRenderer = inject(RawConversationStageRenderer);
  private readonly cleanConversationStageRenderer = inject(CleanConversationStageRenderer);
  private readonly structureConversationStageRenderer = inject(StructureConversationStageRenderer);
  private readonly chunkConversationStageRenderer = inject(ChunkConversationStageRenderer);
  private readonly embedConversationStageRenderer = inject(EmbedConversationStageRenderer);

  private readonly loadedMessagesConversationIds = new Set<string>();
  private readonly conversationDocumentsState = signal<Record<string, BackendConversationDocument>>({});
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
      lastMessageAt: '17:02',
      unreadCount: 2,
      messages: [
        {
          id: 'ana-1',
          direction: 'incoming',
          text: 'Hola, tengo dudas con la poliza de mi vivienda.',
          sentAt: '16:45'
        },
        {
          id: 'ana-2',
          direction: 'outgoing',
          text: 'Claro, te ayudo. Quieres revisar coberturas o fechas?',
          sentAt: '16:47',
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
      sentAt: 'Ahora'
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
      next: (ids) => {
        const normalizedConversations = ids.map((id) => this.buildConversation(id));

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

  private buildConversation(conversationId: string): ChatConversation {
    const predefinedMock = this.mockConversationById[conversationId];

    if (predefinedMock) {
      return predefinedMock;
    }

    const avatar = this.buildAvatarFromId(conversationId);

    return {
      id: conversationId,
      contactName: conversationId,
      contactAvatar: avatar,
      lastMessagePreview: 'Conversacion cargada desde backend.',
      lastMessageAt: 'Ahora',
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

    this.conversationState.update((conversations) =>
      conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: fallbackMessages,
          lastMessagePreview: lastRawMessage?.text ?? conversation.lastMessagePreview,
          lastMessageAt: lastRawMessage?.sentAt ? formatSentAt(lastRawMessage.sentAt) : conversation.lastMessageAt
        };
      })
    );
  }

  private rerenderLoadedConversations(): void {
    const conversationDocuments = this.conversationDocumentsState();
    const renderer = this.stageRenderers[this.viewModeState()];

    this.conversationState.update((conversations) =>
      conversations.map((conversation) => {
        const conversationDocument = conversationDocuments[conversation.id];

        if (!conversationDocument) {
          return conversation;
        }

        const renderedMessages = renderer.render(conversationDocument);

        return {
          ...conversation,
          messages: renderedMessages.length > 0 ? renderedMessages : this.defaultMockMessages
        };
      })
    );
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
