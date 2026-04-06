import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs/operators';

import {
  ConversationsApiService,
  type MessageRatingValue,
  type PhonePrefixLookupResponse
} from '../../../core/api/services/conversations-api.service';
import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { PhoneCountryI18nService } from '../../../core/i18n/services/phone-country-i18n.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import type { SupportedLanguage } from '../../../core/i18n/types/supported-language.type';
import { TimePanelComponent } from '../time-panel/time-panel.component';
import {
  TimeRangeSelection,
  TimeRangeSelectorComponent
} from '../../../shared/components/time-range-selector/time-range-selector.component';
import {
  ChatConversation,
  ChatConversationService,
  ChatMessage,
  ConversationViewMode,
} from '../../services/chat-conversation.service';

@Component({
  selector: 'app-shell-chat',
  imports: [CommonModule, TimePanelComponent, TimeRangeSelectorComponent],
  templateUrl: './app-shell-chat.component.html',
  styleUrl: './app-shell-chat.component.sass',
})
export class AppShellChatComponent implements OnDestroy {
  private readonly chatConversationService = inject(ChatConversationService);
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly phoneCountryI18nService = inject(PhoneCountryI18nService);
  private readonly searchTermState = signal<string>('');
  private readonly composerMessageState = signal<string>('');
  private readonly languageDropdownOpenState = signal<boolean>(false);
  private readonly textSegmentsCache = new Map<string, TextSegment[]>();
  private readonly phoneLookupCache = new Map<string, PhonePrefixLookupResponse | null>();
  private hoverIntentTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeHoveredPhone: string | null = null;
  private readonly hoveredMessageKeyState = signal<string | null>(null);
  private readonly openReactionMenuKeyState = signal<string | null>(null);
  private readonly hoveredConversationIdState = signal<string | null>(null);
  private readonly openConversationDeleteMenuIdState = signal<string | null>(null);
  private readonly operationModeState = signal<OperationMode>('chat');
  private readonly chatHiddenInTimeModeState = signal<boolean>(false);
  private readonly timeRangeSelectorOpenState = signal<boolean>(false);
  private readonly selectedTimeRangeState = signal<TimeRangeSelection | null>(null);
  private readonly timeRangeRequestSequenceState = signal<number>(0);
  private readonly timePaneTopRatioState = signal<number>(0.5);
  private isDraggingTimeSplit = false;
  @ViewChild('messagesArea') private messagesAreaRef?: ElementRef<HTMLDivElement>;
  @ViewChild('composerInput') private composerInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('timeModeLayout') private timeModeLayoutRef?: ElementRef<HTMLDivElement>;

  protected readonly conversations = this.chatConversationService.conversations;
  protected readonly activeConversation = this.chatConversationService.activeConversation;
  protected readonly activeConversationId = this.chatConversationService.activeConversationId;
  protected readonly conversationRatings = this.chatConversationService.conversationRatings;
  protected readonly viewMode = this.chatConversationService.viewMode;
  protected readonly selectedLanguage = this.i18nStateService.selectedLanguage;
  protected readonly availableLanguages: SupportedLanguage[] = ['es', 'en'];
  protected readonly selectedLanguageCountryCode = computed(() =>
    this.languageToCountryCode(this.selectedLanguage())
  );
  protected readonly phoneTooltip = signal<PhoneTooltipState | null>(null);
  protected readonly composerMessage = this.composerMessageState.asReadonly();
  protected readonly agentTyping = this.chatConversationService.agentTyping;
  protected readonly hoveredMessageKey = this.hoveredMessageKeyState.asReadonly();
  protected readonly openReactionMenuKey = this.openReactionMenuKeyState.asReadonly();
  protected readonly hoveredConversationId = this.hoveredConversationIdState.asReadonly();
  protected readonly openConversationDeleteMenuId = this.openConversationDeleteMenuIdState.asReadonly();
  protected readonly languageDropdownOpen = this.languageDropdownOpenState.asReadonly();
  protected readonly operationMode = this.operationModeState.asReadonly();
  protected readonly isTimeMode = computed(() => this.operationModeState() === 'time');
  protected readonly isTimeModeChatHidden = this.chatHiddenInTimeModeState.asReadonly();
  protected readonly isTimeRangeSelectorOpen = this.timeRangeSelectorOpenState.asReadonly();
  protected readonly selectedTimeRange = this.selectedTimeRangeState.asReadonly();
  protected readonly timeRangeSelectionRequest = computed(() => {
    const range = this.selectedTimeRangeState();
    if (!range) {
      return null;
    }

    return {
      requestId: this.timeRangeRequestSequenceState(),
      startTime: range.startTime,
      endTime: range.endTime
    };
  });
  protected readonly timePaneTopHeight = computed(() => `${Math.round(this.timePaneTopRatioState() * 100)}%`);
  protected readonly timePaneBottomHeight = computed(
    () => `${Math.round((1 - this.timePaneTopRatioState()) * 100)}%`
  );
  protected readonly timePanelHeight = computed(() =>
    this.chatHiddenInTimeModeState() ? '100%' : this.timePaneTopHeight()
  );
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

  private readonly autoScrollEffectRef = effect(() => {
    const activeConversation = this.activeConversation();
    const activeConversationId = this.activeConversationId();
    const isTyping = activeConversationId ? this.agentTyping()[activeConversationId] === true : false;
    const messagesSignature = activeConversation
      ? activeConversation.messages
        .map((message) => `${message.id}:${message.text.length}`)
        .join('|')
      : '';

    if (!activeConversation) {
      return;
    }

    void isTyping;
    void messagesSignature;
    this.scheduleScrollToBottom();
  });

  private readonly keepActiveConversationWithinFilterEffectRef = effect(
    () => {
      const conversations = this.filteredConversations();
      const activeConversationId = this.activeConversationId();

      if (conversations.length === 0 || !activeConversationId) {
        return;
      }

      const activeConversationStillVisible = conversations.some(
        (conversation) => conversation.id === activeConversationId
      );

      if (activeConversationStillVisible) {
        return;
      }

      const firstVisibleConversation = conversations[0];
      if (firstVisibleConversation) {
        this.chatConversationService.setActiveConversation(firstVisibleConversation.id);
      }
    },
    { allowSignalWrites: true }
  );

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

  protected modeSwitchAriaLabel(): string {
    return this.t(I18N_KEYS.shell.MODE_SWITCH_ARIA);
  }

  protected fullScreenAriaLabel(): string {
    return this.t(I18N_KEYS.shell.FULL_SCREEN_ARIA);
  }

  protected toggleTimeChatAriaLabel(): string {
    return this.t(I18N_KEYS.shell.TOGGLE_TIME_CHAT_ARIA);
  }

  protected openTimeRangeSelectorAriaLabel(): string {
    return this.t(I18N_KEYS.shell.OPEN_TIME_RANGE_SELECTOR_ARIA);
  }

  protected chatModeAriaLabel(): string {
    return this.t(I18N_KEYS.shell.MODE_CHAT_TAB_ARIA);
  }

  protected timeModeAriaLabel(): string {
    return this.t(I18N_KEYS.shell.MODE_TIME_TAB_ARIA);
  }

  protected mainMenuAriaLabel(): string {
    return this.t(I18N_KEYS.shell.MAIN_MENU_ARIA);
  }

  protected conversationListAriaLabel(): string {
    return this.t(I18N_KEYS.shell.CONVERSATION_LIST_ARIA);
  }

  protected newConversationAriaLabel(): string {
    return this.t(I18N_KEYS.shell.NEW_CONVERSATION_ARIA);
  }

  protected searchConversationAriaLabel(): string {
    return this.t(I18N_KEYS.shell.SEARCH_CONVERSATION_ARIA);
  }

  protected conversationMessagesAriaLabel(): string {
    return this.t(I18N_KEYS.shell.CONVERSATION_MESSAGES_ARIA);
  }

  protected timePanelAriaLabel(): string {
    return this.t(I18N_KEYS.shell.TIME_PANEL_ARIA);
  }

  protected timeSplitterAriaLabel(): string {
    return this.t(I18N_KEYS.shell.TIME_SPLITTER_ARIA);
  }

  protected reactionsAriaLabel(): string {
    return this.t(I18N_KEYS.shell.REACTIONS_ARIA);
  }

  protected openReactionsMenuAriaLabel(): string {
    return this.t(I18N_KEYS.shell.OPEN_REACTIONS_MENU_ARIA);
  }

  protected conversationActionsAriaLabel(): string {
    return this.t(I18N_KEYS.shell.OPEN_CONVERSATION_ACTIONS_ARIA);
  }

  protected deleteConversationAriaLabel(): string {
    return this.t(I18N_KEYS.shell.DELETE_CONVERSATION_ARIA);
  }

  protected attachFileAriaLabel(): string {
    return this.t(I18N_KEYS.shell.ATTACH_FILE_ARIA);
  }

  protected sendMessageAriaLabel(): string {
    return this.t(I18N_KEYS.shell.SEND_MESSAGE_ARIA);
  }

  protected writeMessageAriaLabel(): string {
    return this.t(I18N_KEYS.shell.WRITE_MESSAGE_ARIA);
  }

  protected languageOptionLabel(language: SupportedLanguage): string {
    if (language === 'es') {
      return this.t(I18N_KEYS.shell.LANGUAGE_ES);
    }

    return this.t(I18N_KEYS.shell.LANGUAGE_EN);
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

  protected aiLabel(): string {
    return this.t(I18N_KEYS.shell.AI_LABEL);
  }

  protected typingLabel(): string {
    return this.t(I18N_KEYS.shell.TYPING_LABEL);
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

  protected onConversationMouseEnter(conversationId: string): void {
    this.hoveredConversationIdState.set(conversationId);
  }

  protected onConversationMouseLeave(conversationId: string): void {
    if (this.hoveredConversationIdState() === conversationId) {
      this.hoveredConversationIdState.set(null);
    }

    if (this.openConversationDeleteMenuIdState() === conversationId) {
      this.openConversationDeleteMenuIdState.set(null);
    }
  }

  protected shouldShowConversationActions(conversationId: string): boolean {
    if (conversationId === 'local-simulation') {
      return false;
    }

    return (
      this.hoveredConversationId() === conversationId ||
      this.openConversationDeleteMenuId() === conversationId
    );
  }

  protected toggleConversationDeleteMenu(event: MouseEvent, conversationId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.openConversationDeleteMenuIdState.update((current) =>
      current === conversationId ? null : conversationId
    );
  }

  protected deleteConversation(event: MouseEvent, conversationId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const payloadConversationId = this.toDeletePayloadConversationId(conversationId);

    this.conversationsApiService
      .deleteConversation({ conversationId: payloadConversationId })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.chatConversationService.removeConversationFromState(conversationId);
          this.hoveredConversationIdState.set(null);
          this.openConversationDeleteMenuIdState.set(null);
        },
        error: (error: unknown) => {
          console.error(`Unable to delete conversation id=${conversationId}`, error);
        }
      });
  }

  private toDeletePayloadConversationId(conversationId: string): string {
    const prefix = 'WhatsApp - ';
    const normalizedConversationId = conversationId.startsWith(prefix)
      ? conversationId.slice(prefix.length)
      : conversationId;

    return `${prefix}${normalizedConversationId}`;
  }

  protected selectConversationFromTimePanel(conversationId: string): void {
    this.chatConversationService.ensureConversationDetailsLoaded(conversationId);
    this.chatConversationService.setActiveConversation(conversationId);
  }

  protected activateSimulationConversation(): void {
    this.chatConversationService.activateSimulationConversation();
    this.scheduleFocusComposerInput();
  }

  protected setOperationMode(mode: OperationMode): void {
    this.operationModeState.set(mode);
  }

  protected onTimeSplitDragStart(event: MouseEvent): void {
    event.preventDefault();
    this.isDraggingTimeSplit = true;
    window.addEventListener('mousemove', this.onTimeSplitDragMove);
    window.addEventListener('mouseup', this.onTimeSplitDragEnd);
  }

  protected onComposerInput(value: string): void {
    this.composerMessageState.set(value);
  }

  protected async sendComposerMessage(): Promise<void> {
    const conversationId = this.activeConversationId();

    if (!conversationId) {
      return;
    }

    const messageText = this.composerMessage();
    if (!messageText.trim()) {
      return;
    }

    this.composerMessageState.set('');
    this.scheduleScrollToBottom();
    await this.chatConversationService.sendCustomerMessageToLlm(conversationId, messageText);
  }

  protected isAgentTyping(conversationId: string): boolean {
    return this.agentTyping()[conversationId] === true;
  }

  protected onFullScreenButtonClick(): void {
    void this.toggleFullScreenMode();
  }

  protected onTimeModeChatToggleButtonClick(): void {
    if (this.operationModeState() !== 'time') {
      return;
    }

    this.toggleTimeModeChatVisibility();
  }

  protected openTimeRangeSelector(): void {
    if (this.operationModeState() !== 'time') {
      return;
    }

    this.timeRangeSelectorOpenState.set(true);
  }

  protected closeTimeRangeSelector(): void {
    this.timeRangeSelectorOpenState.set(false);
  }

  protected applyTimeRangeSelection(range: TimeRangeSelection): void {
    this.selectedTimeRangeState.set({
      startTime: new Date(range.startTime),
      endTime: new Date(range.endTime)
    });
    this.timeRangeRequestSequenceState.update((current) => current + 1);
    this.timeRangeSelectorOpenState.set(false);
  }

  ngOnDestroy(): void {
    this.removeTimeSplitDragListeners();
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    if (this.hasEditableKeyboardFocus()) {
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void this.toggleFullScreenMode();
      return;
    }

    if (event.key.toLowerCase() === 'g' && this.operationModeState() === 'time') {
      event.preventDefault();
      this.toggleTimeModeChatVisibility();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectPreviousConversation();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectNextConversation();
    }
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

  protected isGroupStart(messages: ChatMessage[], index: number): boolean {
    const current = messages[index];

    if (!current || current.direction === 'system' || index === 0) {
      return true;
    }

    const previous = messages[index - 1];

    if (!previous || previous.direction === 'system') {
      return true;
    }

    return previous.direction !== current.direction;
  }

  protected isGroupEnd(messages: ChatMessage[], index: number): boolean {
    const current = messages[index];

    if (!current || current.direction === 'system' || index === messages.length - 1) {
      return true;
    }

    const next = messages[index + 1];

    if (!next || next.direction === 'system') {
      return true;
    }

    return next.direction !== current.direction;
  }

  protected getTextSegments(text: string | undefined): TextSegment[] {
    if (!text) {
      return [];
    }

    const cached = this.textSegmentsCache.get(text);

    if (cached) {
      return cached;
    }

    const segments = splitTextIntoSegments(text);
    this.textSegmentsCache.set(text, segments);

    return segments;
  }

  protected trackByTextSegment(index: number): number {
    return index;
  }

  protected messageKey(conversationId: string, messageId: string): string {
    return `${conversationId}|${messageId}`;
  }

  protected onMessageMouseEnter(conversationId: string, messageId: string): void {
    this.hoveredMessageKeyState.set(this.messageKey(conversationId, messageId));
  }

  protected onMessageMouseLeave(conversationId: string, messageId: string): void {
    const key = this.messageKey(conversationId, messageId);

    if (this.hoveredMessageKeyState() === key) {
      this.hoveredMessageKeyState.set(null);
    }

    if (this.openReactionMenuKeyState() === key) {
      this.openReactionMenuKeyState.set(null);
    }
  }

  protected shouldShowReactionControls(
    conversationId: string,
    message: ChatMessage
  ): boolean {
    if (!message.reviewStage || !message.reviewStageId) {
      return false;
    }

    const key = this.messageKey(conversationId, message.id);
    return this.hoveredMessageKey() === key || this.openReactionMenuKey() === key;
  }

  protected toggleReactionMenu(
    event: MouseEvent,
    conversationId: string,
    messageId: string
  ): void {
    event.stopPropagation();

    const key = this.messageKey(conversationId, messageId);
    this.openReactionMenuKeyState.update((current) => (current === key ? null : key));
  }

  protected selectMessageReaction(
    event: MouseEvent,
    conversationId: string,
    message: ChatMessage,
    rating: MessageRatingValue
  ): void {
    event.stopPropagation();
    const stage = message.reviewStage;
    const stageId = message.reviewStageId;

    if (!stage || !stageId) {
      return;
    }

    this.conversationsApiService
      .rateMessage({ conversationId, stage, stageId, rating })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.chatConversationService.applyConversationRating(conversationId, stage, stageId, rating);
          this.openReactionMenuKeyState.set(null);
        },
        error: (error) => {
          console.error('Unable to rate message', error);
        }
      });
  }

  protected selectedReaction(conversationId: string, message: ChatMessage): string | null {
    if (!message.reviewStage || !message.reviewStageId) {
      return null;
    }

    const rating =
      this.conversationRatings()[conversationId]?.[message.reviewStage]?.[message.reviewStageId];

    if (rating === 'warning') {
      return '⚠️';
    }

    if (rating === 'good') {
      return '✅';
    }

    if (rating === 'bad') {
      return '❌';
    }

    return null;
  }

  protected canRateAsWarning(message: ChatMessage): boolean {
    return message.reviewStage === 'raw';
  }

  protected canRateAsGoodOrBad(message: ChatMessage): boolean {
    return (
      message.reviewStage === 'clean' ||
      message.reviewStage === 'structure' ||
      message.reviewStage === 'chunk'
    );
  }

  protected onPhoneMouseEnter(event: MouseEvent, phone: string): void {
    this.activeHoveredPhone = phone;
    this.schedulePhoneLookup(event, phone);
  }

  protected onPhoneMouseMove(event: MouseEvent, phone: string): void {
    if (this.activeHoveredPhone !== phone) {
      this.activeHoveredPhone = phone;
    }

    if (this.phoneTooltip()?.phone === phone) {
      this.phoneTooltip.set({
        ...this.phoneTooltip()!,
        x: event.clientX,
        y: event.clientY
      });
      return;
    }

    this.schedulePhoneLookup(event, phone);
  }

  protected onPhoneMouseLeave(phone: string): void {
    if (this.activeHoveredPhone === phone) {
      this.activeHoveredPhone = null;
    }

    this.clearPhoneLookupTimer();
    this.phoneTooltip.set(null);
  }

  private t(key: (typeof I18N_KEYS)['shell'][keyof (typeof I18N_KEYS)['shell']]): string {
    return this.i18nService.get(key, this.selectedLanguage());
  }

  protected flagIconUrl(countryCode: string | null | undefined): string {
    const normalizedCountryCode = (countryCode ?? '').trim().toLowerCase();
    const safeCountryCode = normalizedCountryCode || 'xx';
    return `assets/flags/4x3/${safeCountryCode}.svg`;
  }

  private languageToCountryCode(language: SupportedLanguage): string {
    return language === 'es' ? 'ES' : 'US';
  }

  private schedulePhoneLookup(event: MouseEvent, phone: string): void {
    this.clearPhoneLookupTimer();

    this.hoverIntentTimeoutId = setTimeout(() => {
      if (this.activeHoveredPhone !== phone) {
        return;
      }

      const cachedLookup = this.phoneLookupCache.get(phone);

      if (cachedLookup !== undefined) {
        const cachedTooltip = this.formatPhoneTooltip(cachedLookup);

        if (cachedTooltip) {
          this.phoneTooltip.set({
            phone,
            text: cachedTooltip.text,
            countryCode: cachedTooltip.countryCode,
            x: event.clientX,
            y: event.clientY
          });
        }
        return;
      }

      this.conversationsApiService
        .getPhonePrefix(phone)
        .pipe(take(1))
        .subscribe({
          next: (response) => {
            this.phoneLookupCache.set(phone, response);
            const tooltip = this.formatPhoneTooltip(response);

            if (!tooltip || this.activeHoveredPhone !== phone) {
              return;
            }

            this.phoneTooltip.set({
              phone,
              text: tooltip.text,
              countryCode: tooltip.countryCode,
              x: event.clientX,
              y: event.clientY
            });
          },
          error: () => {
            this.phoneLookupCache.set(phone, null);
          }
        });
    }, 1000);
  }

  private clearPhoneLookupTimer(): void {
    if (this.hoverIntentTimeoutId !== null) {
      clearTimeout(this.hoverIntentTimeoutId);
      this.hoverIntentTimeoutId = null;
    }
  }

  private formatPhoneTooltip(
    lookup: PhonePrefixLookupResponse | null
  ): { countryCode: string | null; text: string } | null {
    if (!lookup) {
      return null;
    }

    const countryName = this.phoneCountryI18nService.getCountryName(
      lookup.countryCode,
      this.selectedLanguage()
    );

    if (!countryName) {
      return null;
    }

    return {
      countryCode: lookup.countryCode,
      text: lookup.subzoneName
        ? `${countryName} / ${lookup.subzoneName}`
        : countryName
    };
  }

  private scheduleScrollToBottom(): void {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.scrollMessagesToBottom();
      });
    });
  }

  private scrollMessagesToBottom(): void {
    const container = this.messagesAreaRef?.nativeElement;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }

  private scheduleFocusComposerInput(): void {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        this.composerInputRef?.nativeElement.focus();
      });
    });
  }

  private readonly onTimeSplitDragMove = (event: MouseEvent): void => {
    if (!this.isDraggingTimeSplit) {
      return;
    }

    const layout = this.timeModeLayoutRef?.nativeElement;

    if (!layout) {
      return;
    }

    const bounds = layout.getBoundingClientRect();
    const relativeY = event.clientY - bounds.top;
    const rawRatio = relativeY / bounds.height;
    const clampedRatio = Math.min(0.85, Math.max(0.15, rawRatio));

    this.timePaneTopRatioState.set(clampedRatio);
  };

  private readonly onTimeSplitDragEnd = (): void => {
    this.isDraggingTimeSplit = false;
    this.removeTimeSplitDragListeners();
  };

  private removeTimeSplitDragListeners(): void {
    window.removeEventListener('mousemove', this.onTimeSplitDragMove);
    window.removeEventListener('mouseup', this.onTimeSplitDragEnd);
  }

  private hasEditableKeyboardFocus(): boolean {
    const activeElement = document.activeElement as HTMLElement | null;

    if (!activeElement) {
      return false;
    }

    if (activeElement.isContentEditable) {
      return true;
    }

    const tagName = activeElement.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }

  private async toggleFullScreenMode(): Promise<void> {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  }

  private toggleTimeModeChatVisibility(): void {
    this.chatHiddenInTimeModeState.update((isHidden) => !isHidden);
  }

  private selectPreviousConversation(): void {
    const conversations = this.filteredConversations();

    if (conversations.length === 0) {
      return;
    }

    const activeConversationId = this.activeConversationId();
    if (!activeConversationId) {
      this.selectConversation(conversations[0]!.id);
      return;
    }

    const activeIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    const previousIndex =
      activeIndex <= 0 ? conversations.length - 1 : activeIndex - 1;
    const previousConversation = conversations[previousIndex];

    if (previousConversation) {
      this.selectConversation(previousConversation.id);
    }
  }

  private selectNextConversation(): void {
    const conversations = this.filteredConversations();

    if (conversations.length === 0) {
      return;
    }

    const activeConversationId = this.activeConversationId();
    if (!activeConversationId) {
      this.selectConversation(conversations[0]!.id);
      return;
    }

    const activeIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    const nextIndex =
      activeIndex < 0 || activeIndex >= conversations.length - 1 ? 0 : activeIndex + 1;
    const nextConversation = conversations[nextIndex];

    if (nextConversation) {
      this.selectConversation(nextConversation.id);
    }
  }
}

type OperationMode = 'chat' | 'time';

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'phone'; value: string };

type PhoneTooltipState = {
  phone: string;
  text: string;
  countryCode: string | null;
  x: number;
  y: number;
};

function splitTextIntoSegments(text: string): TextSegment[] {
  const pattern = /\b((?:https?:\/\/|www\.)[^\s<]+)|(\+\d[\d\s().-]{4,}\d)/gi;
  const segments: TextSegment[] = [];
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

    const urlCandidate = match[1];
    const phoneCandidate = match[2];

    if (urlCandidate) {
      const normalizedUrl = normalizeMatchedUrl(urlCandidate);
      const trailingSuffix = urlCandidate.slice(normalizedUrl.length);
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
    } else if (phoneCandidate) {
      segments.push({
        type: 'phone',
        value: normalizeMatchedPhone(phoneCandidate)
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

function normalizeMatchedPhone(matchedPhone: string): string {
  return matchedPhone.replace(/[),.;!?]+$/, '');
}
