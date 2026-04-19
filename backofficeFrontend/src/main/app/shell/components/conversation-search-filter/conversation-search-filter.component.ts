import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  input,
  output
} from '@angular/core';

import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';

export type ConversationSearchFilterState = {
  showProspects: boolean;
  showClients: boolean;
  selectedCountryCodes: string[];
  onlyAudioMessages: boolean;
};

export type ConversationSearchFilterCountryOption = {
  countryCode: string;
  label: string;
};

@Component({
  selector: 'app-conversation-search-filter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversation-search-filter.component.html',
  styleUrl: './conversation-search-filter.component.sass'
})
export class ConversationSearchFilterComponent implements AfterViewInit {
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);

  public readonly filters = input<ConversationSearchFilterState>(defaultConversationSearchFilterState());
  public readonly countryOptions = input<ConversationSearchFilterCountryOption[]>([]);

  public readonly closed = output<void>();
  public readonly filtersChanged = output<ConversationSearchFilterState>();

  @ViewChild('panelRoot') private panelRootRef?: ElementRef<HTMLDivElement>;

  protected readonly selectedLanguage = this.i18nStateService.selectedLanguage;
  protected readonly i18n = computed(() => ({
    ariaLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_DIALOG_ARIA),
    title: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_TITLE),
    closeAriaLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_CLOSE_ARIA),
    contactGroupLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_CONTACT_GROUP),
    showProspectLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_SHOW_PROSPECT),
    showClientLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_SHOW_CLIENT),
    countryGroupLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_COUNTRY_GROUP),
    mediaGroupLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_MEDIA_GROUP),
    onlyAudioLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_ONLY_AUDIO),
    resetLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_RESET),
    emptyCountriesLabel: this.t(I18N_KEYS.shell.CONVERSATION_FILTER_EMPTY_COUNTRIES)
  }));

  public ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.panelRootRef?.nativeElement.focus();
    });
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocumentMouseDown(event: MouseEvent): void {
    const panelRoot = this.panelRootRef?.nativeElement;
    const target = event.target;
    if (!(target instanceof Node) || !panelRoot || panelRoot.contains(target)) {
      return;
    }

    this.closed.emit();
  }

  protected onPanelClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected onCloseClick(): void {
    this.closed.emit();
  }

  protected onProspectsToggle(): void {
    this.filtersChanged.emit({
      ...this.filters(),
      showProspects: !this.filters().showProspects
    });
  }

  protected onClientsToggle(): void {
    this.filtersChanged.emit({
      ...this.filters(),
      showClients: !this.filters().showClients
    });
  }

  protected onCountryToggle(countryCode: string): void {
    const selected = new Set(this.filters().selectedCountryCodes);
    if (selected.has(countryCode)) {
      selected.delete(countryCode);
    } else {
      selected.add(countryCode);
    }

    this.filtersChanged.emit({
      ...this.filters(),
      selectedCountryCodes: Array.from(selected).sort((left, right) => left.localeCompare(right))
    });
  }

  protected onOnlyAudioToggle(): void {
    this.filtersChanged.emit({
      ...this.filters(),
      onlyAudioMessages: !this.filters().onlyAudioMessages
    });
  }

  protected onResetClick(): void {
    this.filtersChanged.emit(defaultConversationSearchFilterState());
  }

  protected isCountrySelected(countryCode: string): boolean {
    return this.filters().selectedCountryCodes.includes(countryCode);
  }

  private t(key: string): string {
    return this.i18nService.get(key as never, this.selectedLanguage());
  }
}

export function defaultConversationSearchFilterState(): ConversationSearchFilterState {
  return {
    showProspects: true,
    showClients: true,
    selectedCountryCodes: [],
    onlyAudioMessages: false
  };
}
