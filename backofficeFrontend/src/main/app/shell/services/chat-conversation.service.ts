import { Injectable, computed, inject, signal } from '@angular/core';

import {
  BackendConversationRawMessage,
  ConversationsApiService
} from '../../core/api/services/conversations-api.service';

export type ChatMessageDirection = 'incoming' | 'outgoing' | 'system';

export interface ChatMessage {
  id: string;
  direction: ChatMessageDirection;
  text: string;
  sentAt: string;
  status?: 'sent' | 'delivered' | 'read';
}

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
  private readonly loadedMessagesConversationIds = new Set<string>();

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
        },
        {
          id: 'ana-3',
          direction: 'incoming',
          text: 'Coberturas. Tambien necesito saber si incluye danos por agua.',
          sentAt: '16:50'
        }
      ]
    },
    'conv-carlos': {
      id: 'conv-carlos',
      contactName: 'Carlos Lopez',
      contactAvatar: 'CL',
      lastMessagePreview: 'Gracias, quedo claro. Avanzamos con la visita.',
      lastMessageAt: '15:31',
      unreadCount: 0,
      messages: [
        {
          id: 'carlos-1',
          direction: 'incoming',
          text: 'Tienes disponibilidad para una visita el sabado?',
          sentAt: '15:10'
        },
        {
          id: 'carlos-2',
          direction: 'outgoing',
          text: 'Si, tengo un hueco a las 12:30 y otro a las 17:00.',
          sentAt: '15:17',
          status: 'read'
        }
      ]
    },
    'conv-sofia': {
      id: 'conv-sofia',
      contactName: 'Sofia Martin',
      contactAvatar: 'SM',
      lastMessagePreview: 'Te acabo de pasar la ubicacion exacta.',
      lastMessageAt: 'Ayer',
      unreadCount: 1,
      messages: [
        {
          id: 'sofia-1',
          direction: 'incoming',
          text: 'Nos vemos en oficina o en la propiedad?',
          sentAt: 'Ayer 19:01'
        },
        {
          id: 'sofia-2',
          direction: 'outgoing',
          text: 'En la propiedad para ahorrar tiempo.',
          sentAt: 'Ayer 19:04',
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
    },
    {
      id: 'default-2',
      direction: 'outgoing',
      text: 'Panel de mensajes en modo mock temporal.',
      sentAt: 'Ahora',
      status: 'delivered'
    }
  ];

  private readonly conversationState = signal<ChatConversation[]>([]);
  private readonly activeConversationIdState = signal<string | null>(null);

  readonly conversations = this.conversationState.asReadonly();
  readonly activeConversationId = this.activeConversationIdState.asReadonly();

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
        const mappedMessages = this.mapRawMessagesToChatMessages(
          conversationDocument.rawMessages ?? []
        );

        this.conversationState.update((conversations) =>
          conversations.map((conversation) => {
            if (conversation.id !== conversationId) {
              return conversation;
            }

            const lastMessage = mappedMessages[mappedMessages.length - 1];

            return {
              ...conversation,
              messages: mappedMessages.length > 0 ? mappedMessages : this.defaultMockMessages,
              lastMessagePreview: lastMessage?.text ?? conversation.lastMessagePreview,
              lastMessageAt: lastMessage?.sentAt ?? conversation.lastMessageAt
            };
          })
        );

        this.loadedMessagesConversationIds.add(conversationId);
      },
      error: (error: unknown) => {
        console.error(`Unable to load messages from backend /messages for id=${conversationId}`, error);
      }
    });
  }

  private mapRawMessagesToChatMessages(rawMessages: BackendConversationRawMessage[]): ChatMessage[] {
    return rawMessages.map((rawMessage) => ({
      id: rawMessage.externalId,
      direction: this.mapDirection(rawMessage.direction),
      text: rawMessage.text,
      sentAt: this.formatSentAt(rawMessage.sentAt)
    }));
  }

  private mapDirection(rawDirection: string): ChatMessageDirection {
    const normalizedDirection = rawDirection.trim().toLowerCase();

    if (normalizedDirection === 'agent_to_customer') {
      return 'outgoing';
    }

    if (
      normalizedDirection === 'whatsapp' ||
      normalizedDirection === 'whatsapauto' ||
      normalizedDirection === 'whatsappauto' ||
      normalizedDirection.startsWith('whatsapp_')
    ) {
      return 'system';
    }

    return 'incoming';
  }

  private formatSentAt(rawSentAt: string): string {
    const sentAtDate = new Date(rawSentAt);

    if (Number.isNaN(sentAtDate.getTime())) {
      return rawSentAt;
    }

    return sentAtDate.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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
