import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  BackendConversationRawMessage,
  BackendConversationSummary,
  BackendConversationDocument,
  MessageRatingValue,
  RevisionStage,
  MessageRatingsResponse,
  ConversationsApiService
} from '../../core/api/services/conversations-api.service';
import { type BackendContact } from '../../core/api/services/contacts-api.service';
import { I18nService } from '../../core/i18n/services/i18n.service';
import { I18N_KEYS } from '../../core/i18n/translations/i18n-keys.const';
import { I18nStateService } from '../../core/i18n/services/i18n-state.service';
import { ContactsDirectoryStore } from '../../core/state/contacts-directory.store';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId,
  phonesMatchDigits
} from '../../core/phone/phone-normalization.utils';
import { ChunkConversationStageRenderer } from './view-stages/chunk-conversation-stage.renderer';
import { CleanConversationStageRenderer } from './view-stages/clean-conversation-stage.renderer';
import { NormalizeConversationStageRenderer } from './view-stages/normalize-conversation-stage.renderer';
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
  linkedContactName: string | null;
  filePattern: string | null;
  originalPhoneNumber: string;
  phoneNumber: string;
  contactAvatar: string;
  containsAudio: boolean;
  containsPhoto: boolean;
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
  private readonly contactsDirectoryStore = inject(ContactsDirectoryStore);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly rawConversationStageRenderer = inject(RawConversationStageRenderer);
  private readonly cleanConversationStageRenderer = inject(CleanConversationStageRenderer);
  private readonly normalizeConversationStageRenderer = inject(NormalizeConversationStageRenderer);
  private readonly structureConversationStageRenderer = inject(StructureConversationStageRenderer);
  private readonly chunkConversationStageRenderer = inject(ChunkConversationStageRenderer);
  private readonly embedConversationStageRenderer = inject(EmbedConversationStageRenderer);

  private readonly loadedMessagesConversationIds = new Set<string>();
  private readonly loadingConversationDocumentPromises = new Map<string, Promise<void>>();
  private readonly loadedRatingsConversationIds = new Set<string>();
  private readonly conversationDocumentsState = signal<Record<string, BackendConversationDocument>>({});
  private readonly conversationSummariesState = signal<Record<string, BackendConversationSummary>>({});
  private readonly conversationRatingsState = signal<
    Record<string, MessageRatingsResponse['ratings']>
  >({});
  private readonly contactNameByPhoneDigitsState = signal<Record<string, string>>({});
  private readonly localRawMessagesState = signal<Record<string, ChatMessage[]>>({});
  private readonly agentTypingState = signal<Record<string, boolean>>({});
  private readonly viewModeState = signal<ConversationViewMode>('raw');
  private readonly timeRangeFilterState = signal<TimeRangeFilter | null>(null);
  private readonly filteredConversationIdsState = signal<Set<string> | null>(null);

  private readonly stageRenderers: Record<ConversationViewMode, ConversationStageRenderer> = {
    raw: this.rawConversationStageRenderer,
    clean: this.cleanConversationStageRenderer,
    normalize: this.normalizeConversationStageRenderer,
    structure: this.structureConversationStageRenderer,
    chunk: this.chunkConversationStageRenderer,
    embed: this.embedConversationStageRenderer
  };

  private readonly mockConversationById: Record<string, ChatConversation> = {
    'conv-ana': {
      id: 'conv-ana',
      contactName: 'Ana Ruiz',
      linkedContactName: 'Ana Ruiz',
      filePattern: 'Ana Ruiz',
      originalPhoneNumber: '+34600000000',
      phoneNumber: '+34600000000',
      contactAvatar: 'AR',
      containsAudio: false,
      containsPhoto: false,
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

    try {
      const completionResult = await this.conversationsApiService.completeChatCompletions({
        messages: conversationMessages,
        hints: {
          customerId: conversationId
        },
        maxTokens: 1000
      });

      const finalAgentText = completionResult.content.trim();

      if (finalAgentText) {
        const agentMessage = this.createLocalRawMessage({
          direction: 'outgoing',
          text: finalAgentText,
          isAiGenerated: true,
          usedContext: completionResult.usedContext
        });
        this.pushLocalRawMessage(conversationId, agentMessage);
      }
    } catch (error: unknown) {
      console.error('Unable to complete chat completion', error);
    } finally {
      this.setAgentTyping(conversationId, false);
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
        normalize: {},
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
      }
    );

    effect(
      () => {
        const contacts = this.contactsDirectoryStore.contacts();
        this.contactNameByPhoneDigitsState.set(this.buildContactNameByPhoneDigitsLookup(contacts));
        this.refreshConversationSummaries();
        this.rerenderLoadedConversations();
      }
    );

    void this.loadConversationIds();
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
          contactName: this.getSimulationConversationName(language),
          linkedContactName: null,
          filePattern: null,
          originalPhoneNumber: ChatConversationService.SIMULATION_CONVERSATION_ID,
          phoneNumber: ChatConversationService.SIMULATION_CONVERSATION_ID,
          containsAudio: false,
          containsPhoto: false
        };

        return [
          updatedConversation,
          ...conversations.filter((conversation) => conversation.id !== simulationConversationId)
        ];
      }

      const simulationConversation: ChatConversation = {
        id: simulationConversationId,
        contactName: this.getSimulationConversationName(language),
        linkedContactName: null,
        filePattern: null,
        originalPhoneNumber: simulationConversationId,
        phoneNumber: simulationConversationId,
        contactAvatar: 'LL',
        containsAudio: false,
        containsPhoto: false,
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

  public resolveTimePanelConversationLabel(conversationId: string): string {
    const summary = this.conversationSummariesState()[conversationId];
    const phoneNumber = this.normalizeConversationPhoneNumber(conversationId);
    const linkedContactName = this.resolvePreferredLinkedContactName(
      phoneNumber,
      summary?.contactName
    );

    return this.resolveConversationDisplayName(linkedContactName, phoneNumber);
  }

  private async loadConversationIds(): Promise<void> {
    try {
      await this.contactsDirectoryStore.ensureLoaded();

      const summaries = await firstValueFrom(this.conversationsApiService.getConversationIds());
      const normalizedSummaries = summaries.map((summary) => this.normalizeConversationSummary(summary));
      this.conversationSummariesState.set(
        Object.fromEntries(normalizedSummaries.map((summary) => [summary.id, summary]))
      );
      const normalizedConversations = this.sortConversationsByRecency(
        normalizedSummaries.map((summary) => this.buildConversation(summary))
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
    } catch (error: unknown) {
      console.error('Unable to load conversations from backend /conversations', error);
      this.conversationState.set([]);
      this.activeConversationIdState.set(null);
    }
  }

  private normalizeConversationSummary(summary: BackendConversationSummary): BackendConversationSummary {
    return {
      ...summary,
      contactName: this.resolveLinkedContactName(summary.contactName),
      filePattern: this.resolveFilePattern(summary.filePattern),
      msg: typeof summary.msg === 'string' ? summary.msg : null,
      firstMessageDate:
        typeof summary.firstMessageDate === 'string' ? summary.firstMessageDate : null,
      lastMessageDate:
        typeof summary.lastMessageDate === 'string' ? summary.lastMessageDate : null,
      containsAudio: summary.containsAudio === true
    };
  }

  private buildConversation(summary: BackendConversationSummary): ChatConversation {
    const conversationId = summary.id;
    const predefinedMock = this.mockConversationById[conversationId];

    if (predefinedMock) {
      return predefinedMock;
    }

    const phoneNumber = this.normalizeConversationPhoneNumber(conversationId);
    const originalPhoneNumber = this.extractOriginalConversationPhoneNumber(conversationId);
    const linkedContactName = this.resolvePreferredLinkedContactName(
      phoneNumber,
      summary.contactName
    );
    const displayName = this.resolveConversationDisplayName(linkedContactName, phoneNumber);
    const avatar = this.buildAvatarFromLabel(displayName);

    return {
      id: conversationId,
      contactName: displayName,
      linkedContactName,
      filePattern: summary.filePattern,
      originalPhoneNumber,
      phoneNumber,
      contactAvatar: avatar,
      containsAudio: summary.containsAudio === true,
      containsPhoto: false,
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
        const summary = this.conversationSummariesState()[conversationId];
        const enrichedConversationDocument: BackendConversationDocument = {
          ...conversationDocument,
          filePattern: this.resolveFilePattern(
            conversationDocument.filePattern,
            summary?.filePattern
          )
        };

        this.conversationDocumentsState.update((currentDocuments) => ({
          ...currentDocuments,
          [conversationId]: enrichedConversationDocument
        }));

        this.loadedMessagesConversationIds.add(conversationId);
        this.applyConversationDocumentToState(conversationId, enrichedConversationDocument);
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
    const summary = this.conversationSummariesState()[conversationId];
    const effectiveDocument: BackendConversationDocument = {
      ...conversationDocument,
      filePattern: this.resolveFilePattern(
        conversationDocument.filePattern,
        summary?.filePattern
      )
    };
    const renderer = this.stageRenderers[this.viewModeState()];
    const renderedMessages = this.mergeWithLocalRawMessages(
      conversationId,
      renderer.render(effectiveDocument)
    );
    const containsPhoto = this.conversationContainsPhoto(renderedMessages);
    const fallbackMessages = renderedMessages.length > 0 ? renderedMessages : this.defaultMockMessages;
    const localRawMessages = this.localRawMessagesState()[conversationId] ?? [];
    const lastLocalRawMessage = localRawMessages[localRawMessages.length - 1];
    const lastRawMessage = effectiveDocument.rawMessages?.[effectiveDocument.rawMessages.length - 1];
    const language = this.i18nStateService.selectedLanguage();

    this.conversationState.update((conversations) =>
      this.sortConversationsByRecency(conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const phoneNumber = this.normalizeConversationPhoneNumber(conversationId);
        const originalPhoneNumber = this.extractOriginalConversationPhoneNumber(conversationId);
        const linkedContactName = this.resolvePreferredLinkedContactName(
          phoneNumber,
          effectiveDocument.contactName,
          summary?.contactName,
          conversation.linkedContactName
        );
        const filePattern = this.resolveFilePattern(
          effectiveDocument.filePattern,
          summary?.filePattern,
          conversation.filePattern
        );
        const displayName = this.resolveConversationDisplayName(linkedContactName, phoneNumber);

        return {
          ...conversation,
          contactName: displayName,
          linkedContactName,
          filePattern,
          originalPhoneNumber,
          phoneNumber,
          contactAvatar: this.buildAvatarFromLabel(displayName),
          containsAudio: summary?.containsAudio === true || conversation.containsAudio,
          containsPhoto,
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

        const effectiveDocument: BackendConversationDocument = {
          ...conversationDocument,
          filePattern: this.resolveFilePattern(
            conversationDocument.filePattern,
            this.conversationSummariesState()[conversation.id]?.filePattern
          )
        };

        const renderedMessages = renderer.render(effectiveDocument);
        const mergedMessages = this.mergeWithLocalRawMessages(conversation.id, renderedMessages);
        const containsPhoto = this.conversationContainsPhoto(mergedMessages);
        const summary = this.conversationSummariesState()[conversation.id];
        const phoneNumber = this.normalizeConversationPhoneNumber(conversation.id);
        const originalPhoneNumber = this.extractOriginalConversationPhoneNumber(conversation.id);
        const linkedContactName = this.resolvePreferredLinkedContactName(
          phoneNumber,
          effectiveDocument.contactName,
          summary?.contactName,
          conversation.linkedContactName
        );
        const filePattern = this.resolveFilePattern(
          effectiveDocument.filePattern,
          summary?.filePattern,
          conversation.filePattern
        );
        const displayName = this.resolveConversationDisplayName(linkedContactName, phoneNumber);

        return {
          ...conversation,
          contactName: displayName,
          linkedContactName,
          filePattern,
          originalPhoneNumber,
          phoneNumber,
          contactAvatar: this.buildAvatarFromLabel(displayName),
          containsAudio: summary?.containsAudio === true || conversation.containsAudio,
          containsPhoto,
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
        const phoneNumber = this.normalizeConversationPhoneNumber(conversation.id);
        const originalPhoneNumber = this.extractOriginalConversationPhoneNumber(conversation.id);
        const linkedContactName = this.resolvePreferredLinkedContactName(
          phoneNumber,
          summary.contactName,
          conversation.linkedContactName
        );
        const filePattern = this.resolveFilePattern(summary.filePattern, conversation.filePattern);
        const displayName = this.resolveConversationDisplayName(linkedContactName, phoneNumber);

        return {
          ...conversation,
          contactName: displayName,
          linkedContactName,
          filePattern,
          originalPhoneNumber,
          phoneNumber,
          contactAvatar: this.buildAvatarFromLabel(displayName),
          containsAudio: summary.containsAudio === true,
          containsPhoto: conversation.containsPhoto,
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
      const leftHasContactName = !!this.resolveLinkedContactName(left.linkedContactName);
      const rightHasContactName = !!this.resolveLinkedContactName(right.linkedContactName);

      if (leftHasContactName !== rightHasContactName) {
        return leftHasContactName ? -1 : 1;
      }

      const leftLabel = this.getVisibleConversationSortLabel(left);
      const rightLabel = this.getVisibleConversationSortLabel(right);
      const labelComparison = leftLabel.localeCompare(rightLabel, undefined, {
        sensitivity: 'base',
        numeric: true
      });

      if (labelComparison !== 0) {
        return labelComparison;
      }

      return left.id.localeCompare(right.id, undefined, {
        sensitivity: 'base',
        numeric: true
      });
    });
  }

  private getVisibleConversationSortLabel(conversation: ChatConversation): string {
    return this.resolveLinkedContactName(
      conversation.linkedContactName,
      conversation.phoneNumber,
      conversation.contactName,
      conversation.id
    ) ?? conversation.id;
  }

  private normalizeConversationPhoneNumber(conversationId: string): string {
    const normalized = this.extractOriginalConversationPhoneNumber(conversationId);
    const canonical = canonicalizePhoneNumber(normalized);

    if (canonical) {
      return canonical.normalizedValue;
    }

    return normalized.length > 0 ? normalized : conversationId;
  }

  private extractOriginalConversationPhoneNumber(conversationId: string): string {
    return normalizeConversationSourceId(conversationId);
  }

  private buildContactNameByPhoneDigitsLookup(contacts: BackendContact[]): Record<string, string> {
    const lookup: Record<string, string> = {};

    for (const contact of contacts) {
      const contactName = this.pickFirstContactName(contact.names);
      if (!contactName) {
        continue;
      }

      for (const rawPhone of contact.phoneNumbers) {
        const canonical = canonicalizePhoneNumber(rawPhone);
        if (!canonical?.digitsOnly) {
          continue;
        }

        if (!(canonical.digitsOnly in lookup)) {
          lookup[canonical.digitsOnly] = contactName;
        }
      }
    }

    return lookup;
  }

  private pickFirstContactName(names: string[]): string | null {
    for (const name of names) {
      if (typeof name !== 'string') {
        continue;
      }

      const trimmed = name.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private findContactNameByPhoneNumber(phoneNumber: string): string | null {
    const canonicalPhone = canonicalizePhoneNumber(phoneNumber);
    const digits = canonicalPhone?.digitsOnly ?? phoneNumber.replace(/\D+/g, '');

    if (!digits) {
      return null;
    }

    const lookup = this.contactNameByPhoneDigitsState();
    const directMatch = lookup[digits];
    if (directMatch) {
      return directMatch;
    }

    for (const [candidateDigits, contactName] of Object.entries(lookup)) {
      if (phonesMatchDigits(candidateDigits, digits)) {
        return contactName;
      }
    }

    return null;
  }

  private resolvePreferredLinkedContactName(
    phoneNumber: string,
    ...candidates: unknown[]
  ): string | null {
    const contactDirectoryName = this.findContactNameByPhoneNumber(phoneNumber);

    return this.resolveLinkedContactName(contactDirectoryName, ...candidates);
  }

  private resolveLinkedContactName(...candidates: unknown[]): string | null {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private resolveFilePattern(...candidates: unknown[]): string | null {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return null;
  }

  private resolveConversationDisplayName(contactName: string | null, phoneNumber: string): string {
    if (contactName) {
      return contactName;
    }

    return phoneNumber;
  }

  private buildAvatarFromLabel(label: string): string {
    const alphanumeric = label.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

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
    usedContext?: string[];
  }): ChatMessage {
    const nowIso = new Date().toISOString();

    return {
      id: params.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: params.direction,
      text: params.text,
      sentAt: formatSentAt(nowIso, this.i18nStateService.selectedLanguage()),
      stageLabel: 'raw',
      isAiGenerated: params.isAiGenerated,
      usedContext: params.usedContext
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
          contactName: this.getSimulationConversationName(language),
          linkedContactName: null,
          filePattern: null,
          originalPhoneNumber: ChatConversationService.SIMULATION_CONVERSATION_ID,
          phoneNumber: ChatConversationService.SIMULATION_CONVERSATION_ID,
          containsAudio: false,
          containsPhoto: false
        };
      })
    );
  }

  private conversationContainsPhoto(messages: ChatMessage[]): boolean {
    return messages.some((message) => typeof message.mediaUrl === 'string' && message.mediaUrl.trim().length > 0);
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
