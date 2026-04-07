import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  BackendConversationRawMessage,
  BackendConversationSummary,
  BackendConversationDocument,
  ChatCompletionsStreamChunk,
  MessageRatingValue,
  RevisionStage,
  MessageRatingsResponse,
  ConversationsApiService
} from '../../core/api/services/conversations-api.service';
import { I18nService } from '../../core/i18n/services/i18n.service';
import { I18N_KEYS } from '../../core/i18n/translations/i18n-keys.const';
import { I18nStateService } from '../../core/i18n/services/i18n-state.service';
import { ChunkConversationStageRenderer } from './view-stages/chunk-conversation-stage.renderer';
import { CleanConversationStageRenderer } from './view-stages/clean-conversation-stage.renderer';
import type { ConversationStageRenderer } from './view-stages/conversation-stage-renderer.interface';
import { formatDateLabel, formatSentAt } from './view-stages/conversation-stage-renderer.utils';
import { EmbedConversationStageRenderer } from './view-stages/embed-conversation-stage.renderer';
import { RawConversationStageRenderer } from './view-stages/raw-conversation-stage.renderer';
import { StructureConversationStageRenderer } from './view-stages/structure-conversation-stage.renderer';
import type { ChatMessage, ConversationViewMode } from './view-stages/conversation-view.types';
import { GeneratedTextSensorshipService } from './generated-text-sensorship.service';

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

export type TimeRangeFilter = {
  startMs: number;
  endMs: number;
};

type WrapperChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

@Injectable({ providedIn: 'root' })
export class ChatConversationService {
  private static readonly SIMULATION_CONVERSATION_ID = 'local-simulation';
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly rawConversationStageRenderer = inject(RawConversationStageRenderer);
  private readonly cleanConversationStageRenderer = inject(CleanConversationStageRenderer);
  private readonly structureConversationStageRenderer = inject(StructureConversationStageRenderer);
  private readonly chunkConversationStageRenderer = inject(ChunkConversationStageRenderer);
  private readonly embedConversationStageRenderer = inject(EmbedConversationStageRenderer);
  private readonly generatedTextSensorshipService = inject(GeneratedTextSensorshipService);

  private readonly loadedMessagesConversationIds = new Set<string>();
  private readonly loadingConversationDocumentPromises = new Map<string, Promise<void>>();
  private readonly loadedRatingsConversationIds = new Set<string>();
  private readonly conversationDocumentsState = signal<Record<string, BackendConversationDocument>>({});
  private readonly conversationSummariesState = signal<Record<string, BackendConversationSummary>>({});
  private readonly conversationRatingsState = signal<
    Record<string, MessageRatingsResponse['ratings']>
  >({});
  private readonly localRawMessagesState = signal<Record<string, ChatMessage[]>>({});
  private readonly agentTypingState = signal<Record<string, boolean>>({});
  private readonly viewModeState = signal<ConversationViewMode>('raw');
  private readonly timeRangeFilterState = signal<TimeRangeFilter | null>(null);
  private readonly filteredConversationIdsState = signal<Set<string> | null>(null);

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
      text: this.getConversationSyncedPlaceholder(this.i18nStateService.selectedLanguage()),
      sentAt: formatSentAt(new Date().toISOString(), this.i18nStateService.selectedLanguage())
    }
  ];

  private readonly conversationState = signal<ChatConversation[]>([]);
  private readonly activeConversationIdState = signal<string | null>(null);

  readonly conversations = computed(() => {
    const filteredConversationIds = this.filteredConversationIdsState();

    if (!filteredConversationIds) {
      return this.conversationState();
    }

    return this.conversationState().filter((conversation) => {
      if (this.isSimulationConversationId(conversation.id)) {
        return true;
      }

      return filteredConversationIds.has(conversation.id);
    });
  });
  readonly conversationSummaries = this.conversationSummariesState.asReadonly();
  readonly totalConversationIds = computed(() => Object.keys(this.conversationSummariesState()));
  readonly filteredConversationIds = computed(() => {
    const filteredConversationIds = this.filteredConversationIdsState();

    if (!filteredConversationIds) {
      return this.totalConversationIds();
    }

    return [...filteredConversationIds];
  });
  readonly timeRangeFilter = this.timeRangeFilterState.asReadonly();
  readonly activeConversationId = this.activeConversationIdState.asReadonly();
  readonly conversationRatings = this.conversationRatingsState.asReadonly();
  readonly agentTyping = this.agentTypingState.asReadonly();
  readonly viewMode = this.viewModeState.asReadonly();

  async sendCustomerMessageToLlm(conversationId: string, rawText: string): Promise<void> {
    const trimmedText = rawText.trim();

    if (!trimmedText) {
      return;
    }

    const selectedConversationId = this.activeConversationIdState();
    const localStoreRawTexts =
      this.conversationDocumentsState()[conversationId]?.rawMessages
        ?.map((message) => message.text?.trim())
        .filter((text): text is string => typeof text === 'string' && text.length > 0) ?? [];
    console.log('[chat-debug] Selected conversationId:', selectedConversationId);
    console.log('[chat-debug] Local store rawMessages texts:', localStoreRawTexts);

    await this.ensureConversationHistoryReady(conversationId);

    const historyMessages = this.buildConversationHistoryPayload(conversationId);

    const conversationMessages: WrapperChatMessage[] = [
      ...historyMessages,
      {
        role: 'user',
        content: trimmedText
      }
    ];

    const userMessage = this.createLocalRawMessage({
      direction: 'incoming',
      text: trimmedText
    });
    this.pushLocalRawMessage(conversationId, userMessage);
    this.setAgentTyping(conversationId, true);
    let aggregatedAgentText = '';
    let doneReceived = false;

    try {
      await this.conversationsApiService.streamChatCompletions(
        {
          messages: conversationMessages,
          hints: {
            customerId: conversationId
          },
          maxTokens: 1000
        },
        {
          onChunk: (chunk) => {
            const token = this.extractTextToken(chunk);

            if (!token) {
              return;
            }

            aggregatedAgentText += token;
          },
          onDone: () => {
            doneReceived = true;
            const finalAgentText = this.generatedTextSensorshipService
              .sanitizeGeneratedText(aggregatedAgentText)
              .trim();

            if (finalAgentText) {
              const agentMessage = this.createLocalRawMessage({
                direction: 'outgoing',
                text: finalAgentText,
                isAiGenerated: true
              });
              this.pushLocalRawMessage(conversationId, agentMessage);
            }

            this.setAgentTyping(conversationId, false);
          }
        }
      );
    } catch (error: unknown) {
      console.error('Unable to stream chat completion', error);
      this.setAgentTyping(conversationId, false);
    } finally {
      if (!doneReceived) {
        this.setAgentTyping(conversationId, false);
      }
    }
  }

  applyConversationRating(
    conversationId: string,
    stage: RevisionStage,
    stageId: string,
    rating: MessageRatingValue
  ): void {
    this.conversationRatingsState.update((current) => {
      const currentRatings = current[conversationId] ?? {
        raw: {},
        clean: {},
        structure: {},
        chunk: {}
      };
      const nextStageRatings = { ...currentRatings[stage] };

      if (rating === 'cleared') {
        delete nextStageRatings[stageId];
      } else {
        nextStageRatings[stageId] = rating;
      }

      return {
        ...current,
        [conversationId]: {
          ...currentRatings,
          [stage]: nextStageRatings
        }
      };
    });
  }

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
        this.refreshSimulationConversationLabel();
        this.refreshConversationSummaries();
        this.rerenderLoadedConversations();
      },
      { allowSignalWrites: true }
    );

    this.loadConversationIds();
  }

  setActiveConversation(conversationId: string): void {
    this.activeConversationIdState.set(conversationId);

    if (this.isSimulationConversationId(conversationId)) {
      return;
    }

    this.ensureConversationDetailsLoaded(conversationId);
  }

  removeConversationFromState(conversationId: string): void {
    if (this.isSimulationConversationId(conversationId)) {
      return;
    }

    this.loadedMessagesConversationIds.delete(conversationId);
    this.loadedRatingsConversationIds.delete(conversationId);

    this.conversationSummariesState.update((current) => this.omitRecordKey(current, conversationId));
    this.conversationDocumentsState.update((current) => this.omitRecordKey(current, conversationId));
    this.conversationRatingsState.update((current) => this.omitRecordKey(current, conversationId));
    this.localRawMessagesState.update((current) => this.omitRecordKey(current, conversationId));
    this.agentTypingState.update((current) => this.omitRecordKey(current, conversationId));

    this.conversationState.update((conversations) =>
      conversations.filter((conversation) => conversation.id !== conversationId)
    );

    if (this.activeConversationIdState() === conversationId) {
      const nextConversationId = this.conversations()[0]?.id ?? null;
      this.activeConversationIdState.set(nextConversationId);

      if (nextConversationId && !this.isSimulationConversationId(nextConversationId)) {
        this.ensureConversationDetailsLoaded(nextConversationId);
      }
    }

    this.recomputeFilteredConversationIds();
  }

  ensureConversationDetailsLoaded(conversationId: string): void {
    if (this.isSimulationConversationId(conversationId)) {
      return;
    }

    this.loadConversationMessages(conversationId);
  }

  setTimeRangeFilter(range: TimeRangeFilter | null): void {
    const currentRange = this.timeRangeFilterState();

    if (!range) {
      if (!currentRange) {
        return;
      }
      this.timeRangeFilterState.set(null);
      this.filteredConversationIdsState.set(null);
      return;
    }

    const startMs = Math.min(range.startMs, range.endMs);
    const endMs = Math.max(range.startMs, range.endMs);

    if (currentRange && currentRange.startMs === startMs && currentRange.endMs === endMs) {
      return;
    }

    this.timeRangeFilterState.set({ startMs, endMs });
    this.recomputeFilteredConversationIds();
  }

  activateSimulationConversation(): void {
    const language = this.i18nStateService.selectedLanguage();
    const simulationConversationId = ChatConversationService.SIMULATION_CONVERSATION_ID;

    this.conversationState.update((conversations) => {
      const existingConversation = conversations.find(
        (conversation) => conversation.id === simulationConversationId
      );

      if (existingConversation) {
        const updatedConversation: ChatConversation = {
          ...existingConversation,
          contactName: this.getSimulationConversationName(language)
        };

        return [
          updatedConversation,
          ...conversations.filter((conversation) => conversation.id !== simulationConversationId)
        ];
      }

      const simulationConversation: ChatConversation = {
        id: simulationConversationId,
        contactName: this.getSimulationConversationName(language),
        contactAvatar: 'LL',
        lastMessagePreview: '',
        lastMessageAt: formatSentAt(new Date().toISOString(), language),
        unreadCount: 0,
        messages: []
      };

      return [simulationConversation, ...conversations];
    });

    this.activeConversationIdState.set(simulationConversationId);
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
        this.recomputeFilteredConversationIds();

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
      lastMessagePreview:
        summary.msg ?? this.getConversationSyncedPlaceholder(this.i18nStateService.selectedLanguage()),
      lastMessageAt: formatDateLabel(summary.lastMessageDate, this.i18nStateService.selectedLanguage()),
      unreadCount: 0,
      messages: this.defaultMockMessages
    };
  }

  private loadConversationMessages(conversationId: string): void {
    if (this.loadedMessagesConversationIds.has(conversationId)) {
      return;
    }

    void this.ensureConversationHistoryReady(conversationId);
  }

  private async ensureConversationHistoryReady(conversationId: string): Promise<void> {
    if (this.isSimulationConversationId(conversationId)) {
      return;
    }

    const alreadyLoaded = this.conversationDocumentsState()[conversationId];
    if (alreadyLoaded) {
      return;
    }

    const inFlight = this.loadingConversationDocumentPromises.get(conversationId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const loadingPromise = firstValueFrom(this.conversationsApiService.getConversationById(conversationId))
      .then((conversationDocument) => {
        this.conversationDocumentsState.update((currentDocuments) => ({
          ...currentDocuments,
          [conversationId]: conversationDocument
        }));

        this.loadedMessagesConversationIds.add(conversationId);
        this.applyConversationDocumentToState(conversationId, conversationDocument);
        this.loadConversationRatings(conversationId);
      })
      .catch((error: unknown) => {
        console.error(`Unable to preload conversation history for id=${conversationId}`, error);
      })
      .finally(() => {
        this.loadingConversationDocumentPromises.delete(conversationId);
      });

    this.loadingConversationDocumentPromises.set(conversationId, loadingPromise);
    await loadingPromise;
  }

  private loadConversationRatings(conversationId: string): void {
    if (this.loadedRatingsConversationIds.has(conversationId)) {
      return;
    }

    this.conversationsApiService.getMessageRatings(conversationId).subscribe({
      next: (ratingsResponse) => {
        this.loadedRatingsConversationIds.add(conversationId);
        this.conversationRatingsState.update((current) => ({
          ...current,
          [conversationId]: ratingsResponse.ratings
        }));
      },
      error: (error: unknown) => {
        console.error(
          `Unable to load message ratings from backend /message-ratings for id=${conversationId}`,
          error
        );
      }
    });
  }

  private applyConversationDocumentToState(
    conversationId: string,
    conversationDocument: BackendConversationDocument
  ): void {
    const renderer = this.stageRenderers[this.viewModeState()];
    const renderedMessages = this.mergeWithLocalRawMessages(
      conversationId,
      renderer.render(conversationDocument)
    );
    const fallbackMessages = renderedMessages.length > 0 ? renderedMessages : this.defaultMockMessages;
    const localRawMessages = this.localRawMessagesState()[conversationId] ?? [];
    const lastLocalRawMessage = localRawMessages[localRawMessages.length - 1];
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
            lastLocalRawMessage?.text ||
            lastRawMessage?.text ||
            summary?.msg ||
            conversation.lastMessagePreview,
          lastMessageAt: lastLocalRawMessage?.sentAt
            ? lastLocalRawMessage.sentAt
            : lastRawMessage?.sentAt
              ? formatSentAt(lastRawMessage.sentAt, language)
            : formatDateLabel(summary?.lastMessageDate, language)
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
        const mergedMessages = this.mergeWithLocalRawMessages(conversation.id, renderedMessages);

        return {
          ...conversation,
          messages: mergedMessages.length > 0 ? mergedMessages : this.defaultMockMessages
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

        const localRawMessages = this.localRawMessagesState()[conversation.id] ?? [];
        const lastLocalRawMessage = localRawMessages[localRawMessages.length - 1];

        return {
          ...conversation,
          lastMessagePreview:
            lastLocalRawMessage?.text || summary.msg || conversation.lastMessagePreview,
          lastMessageAt:
            lastLocalRawMessage?.sentAt || formatDateLabel(summary.lastMessageDate, language)
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
    if (this.isSimulationConversationId(conversationId)) {
      return Number.MAX_SAFE_INTEGER;
    }

    const localRawMessages = this.localRawMessagesState()[conversationId] ?? [];
    const lastLocalRawMessage = localRawMessages[localRawMessages.length - 1];

    if (lastLocalRawMessage?.sentAt) {
      return this.toTimestamp(lastLocalRawMessage.sentAt);
    }

    const document = this.conversationDocumentsState()[conversationId];
    const lastRawMessage = document?.rawMessages?.[document.rawMessages.length - 1];

    if (lastRawMessage?.sentAt) {
      return this.toTimestamp(lastRawMessage.sentAt);
    }

    const summaryDate = this.conversationSummariesState()[conversationId]?.lastMessageDate;
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

  private mergeWithLocalRawMessages(conversationId: string, renderedMessages: ChatMessage[]): ChatMessage[] {
    if (this.viewModeState() !== 'raw') {
      return renderedMessages;
    }

    const localMessages = this.localRawMessagesState()[conversationId] ?? [];

    if (localMessages.length === 0) {
      return renderedMessages;
    }

    return [...renderedMessages, ...localMessages];
  }

  private createLocalRawMessage(params: {
    direction: ChatMessage['direction'];
    text: string;
    id?: string;
    isAiGenerated?: boolean;
  }): ChatMessage {
    const nowIso = new Date().toISOString();

    return {
      id: params.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: params.direction,
      text: params.text,
      sentAt: formatSentAt(nowIso, this.i18nStateService.selectedLanguage()),
      stageLabel: 'raw',
      isAiGenerated: params.isAiGenerated
    };
  }

  private pushLocalRawMessage(conversationId: string, message: ChatMessage): void {
    this.localRawMessagesState.update((current) => ({
      ...current,
      [conversationId]: [...(current[conversationId] ?? []), message]
    }));

    const conversationDocument = this.conversationDocumentsState()[conversationId];
    if (conversationDocument) {
      this.applyConversationDocumentToState(conversationId, conversationDocument);
      return;
    }

    this.conversationState.update((conversations) =>
      this.sortConversationsByRecency(conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: [...conversation.messages, message],
          lastMessagePreview: message.text || conversation.lastMessagePreview,
          lastMessageAt: message.sentAt
        };
      }))
    );
  }

  private setAgentTyping(conversationId: string, isTyping: boolean): void {
    this.agentTypingState.update((current) => ({
      ...current,
      [conversationId]: isTyping
    }));
  }

  private extractTextToken(chunk: ChatCompletionsStreamChunk): string {
    const token = chunk.choices?.[0]?.delta?.content;
    return typeof token === 'string' ? token : '';
  }

  private buildConversationHistoryPayload(conversationId: string): WrapperChatMessage[] {
    const backendRawMessages =
      this.conversationDocumentsState()[conversationId]?.rawMessages?.map((message) =>
        this.mapRawMessageToLastMessage(message)
      ) ?? [];
    const localRawMessages =
      this.localRawMessagesState()[conversationId]
        ?.map((message) => this.mapLocalMessageToLastMessage(message))
        ?? [];

    return [...backendRawMessages, ...localRawMessages].filter(
      (message): message is WrapperChatMessage => message !== null
    );
  }

  private mapRawMessageToLastMessage(
    message: BackendConversationRawMessage
  ): WrapperChatMessage | null {
    const text = message.text.trim();
    if (!text) {
      return null;
    }

    const normalizedDirection = message.direction.trim().toLowerCase();

    if (
      normalizedDirection === 'incoming' ||
      normalizedDirection === 'customer_to_agent' ||
      normalizedDirection === 'customer'
    ) {
      return {
        role: 'user',
        content: text
      };
    }

    if (
      normalizedDirection === 'outgoing' ||
      normalizedDirection === 'agent_to_customer' ||
      normalizedDirection === 'agent'
    ) {
      return {
        role: 'assistant',
        content: text
      };
    }

    return null;
  }

  private mapLocalMessageToLastMessage(
    message: ChatMessage
  ): WrapperChatMessage | null {
    const text = message.text.trim();
    if (!text) {
      return null;
    }

    if (message.direction === 'incoming') {
      return {
        role: 'user',
        content: text
      };
    }

    if (message.direction === 'outgoing') {
      return {
        role: 'assistant',
        content: text
      };
    }

    return null;
  }

  private refreshSimulationConversationLabel(): void {
    const language = this.i18nStateService.selectedLanguage();
    const simulationConversationId = ChatConversationService.SIMULATION_CONVERSATION_ID;

    this.conversationState.update((conversations) =>
      conversations.map((conversation) => {
        if (conversation.id !== simulationConversationId) {
          return conversation;
        }

        return {
          ...conversation,
          contactName: this.getSimulationConversationName(language)
        };
      })
    );
  }

  private getSimulationConversationName(language: 'es' | 'en'): string {
    return this.i18nService.get(I18N_KEYS.shell.SIMULATION_CONVERSATION_NAME, language);
  }

  private getConversationSyncedPlaceholder(language: 'es' | 'en'): string {
    return this.i18nService.get(I18N_KEYS.shell.CONVERSATION_SYNCED_PLACEHOLDER, language);
  }

  private isSimulationConversationId(conversationId: string): boolean {
    return conversationId === ChatConversationService.SIMULATION_CONVERSATION_ID;
  }

  private recomputeFilteredConversationIds(): void {
    const range = this.timeRangeFilterState();
    const currentFilteredIds = this.filteredConversationIdsState();

    if (!range) {
      if (currentFilteredIds !== null) {
        this.filteredConversationIdsState.set(null);
      }
      return;
    }

    const summaries = this.conversationSummariesState();
    const filteredIds = Object.values(summaries)
      .filter((summary) => this.summaryOverlapsRange(summary, range))
      .map((summary) => summary.id);

    const nextFilteredIds = new Set(filteredIds);
    if (this.areIdSetsEqual(currentFilteredIds, nextFilteredIds)) {
      return;
    }

    this.filteredConversationIdsState.set(nextFilteredIds);
  }

  private summaryOverlapsRange(summary: BackendConversationSummary, range: TimeRangeFilter): boolean {
    const start = this.toTimestampOrNull(summary.firstMessageDate);
    const end = this.toTimestampOrNull(summary.lastMessageDate);

    if (start === null && end === null) {
      return true;
    }

    const safeStart = start ?? end!;
    const safeEnd = Math.max(safeStart, end ?? safeStart);
    return safeStart <= range.endMs && safeEnd >= range.startMs;
  }

  private toTimestampOrNull(rawDate: string | null | undefined): number | null {
    if (!rawDate) {
      return null;
    }

    const normalizedDate =
      rawDate.includes(' ') && !rawDate.includes('T') ? rawDate.replace(' ', 'T') : rawDate;
    const timestamp = new Date(normalizedDate).getTime();

    return Number.isNaN(timestamp) ? null : timestamp;
  }

  private areIdSetsEqual(left: Set<string> | null, right: Set<string> | null): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right || left.size !== right.size) {
      return false;
    }

    for (const id of left) {
      if (!right.has(id)) {
        return false;
      }
    }

    return true;
  }

  private omitRecordKey<TValue>(record: Record<string, TValue>, keyToOmit: string): Record<string, TValue> {
    if (!(keyToOmit in record)) {
      return record;
    }

    const { [keyToOmit]: omittedValue, ...rest } = record;
    void omittedValue;
    return rest;
  }
}
