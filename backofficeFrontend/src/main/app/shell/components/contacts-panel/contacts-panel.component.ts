import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ConversationsApiService,
  type BackendConversationSummary,
  type PhonePrefixLookupResponse
} from '../../../core/api/services/conversations-api.service';
import { type BackendContact } from '../../../core/api/services/contacts-api.service';
import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { PhoneCountryI18nService } from '../../../core/i18n/services/phone-country-i18n.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import { ContactsDirectoryStore } from '../../../core/state/contacts-directory.store';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId,
  phonesMatchDigits
} from '../../../core/phone/phone-normalization.utils';

@Component({
  selector: 'app-contacts-panel',
  imports: [CommonModule],
  templateUrl: './contacts-panel.component.html',
  styleUrl: './contacts-panel.component.sass'
})
export class ContactsPanelComponent implements OnInit, OnChanges {
  @Input() public selectedPhoneSlug: string | null = null;

  @ViewChild('spreadsheetTableScroll')
  private spreadsheetTableScrollRef?: ElementRef<HTMLDivElement>;

  private readonly contactsDirectoryStore = inject(ContactsDirectoryStore);
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly phoneCountryI18nService = inject(PhoneCountryI18nService);

  private readonly groupedRowsState = signal<ContactsWorkbookGroups>(createEmptyWorkbookGroups());
  private readonly activeWorkbookTabState = signal<ContactsWorkbookTab>('contactsWithConversations');
  private readonly loadingState = signal<boolean>(true);
  private readonly errorState = signal<boolean>(false);
  private readonly countryCodeByPhoneState = signal<Record<string, string | null>>({});
  private readonly sortState = signal<ContactsSortState>({
    field: null,
    direction: null
  });
  private readonly selectedRowIdState = signal<string | null>(null);
  private readonly selectedPhoneSlugState = signal<string | null>(null);

  protected readonly selectedLanguage = this.i18nStateService.selectedLanguage;
  protected readonly activeWorkbookTab = this.activeWorkbookTabState.asReadonly();
  protected readonly isLoading = this.loadingState.asReadonly();
  protected readonly hasError = this.errorState.asReadonly();
  protected readonly workbookGroups = this.groupedRowsState.asReadonly();
  protected readonly selectedRowId = this.selectedRowIdState.asReadonly();
  protected readonly activeRows = computed(() => {
    const groups = this.groupedRowsState();
    const activeTab = this.activeWorkbookTabState();

    return groups[activeTab];
  });
  protected readonly visibleRows = computed(() =>
    this.sortContacts(
      this.activeRows(),
      this.sortState(),
      this.countryCodeByPhoneState(),
      this.selectedLanguage() === 'es' ? 'es' : 'en'
    )
  );
  protected readonly contactsWithConversationsCount = computed(
    () => this.groupedRowsState().contactsWithConversations.length
  );
  protected readonly conversationsWithoutContactsCount = computed(
    () => this.groupedRowsState().conversationsWithoutContacts.length
  );
  protected readonly contactsWithoutConversationsCount = computed(
    () => this.groupedRowsState().contactsWithoutConversations.length
  );

  ngOnInit(): void {
    void this.loadWorkbookData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!('selectedPhoneSlug' in changes)) {
      return;
    }

    this.selectedPhoneSlugState.set(this.normalizePhoneSlug(this.selectedPhoneSlug));
    this.selectContactByPhoneSlug();
  }

  protected contactsPanelAriaLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_PANEL_ARIA);
  }

  protected workbookTabsAriaLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_WORKBOOK_TABS_ARIA);
  }

  protected contactsWithConversationsTabLabel(): string {
    return `${this.t(I18N_KEYS.shell.CONTACTS_WORKBOOK_CONTACTS_WITH_CONVERSATIONS)} (${this.contactsWithConversationsCount()})`;
  }

  protected conversationsWithoutContactsTabLabel(): string {
    return `${this.t(I18N_KEYS.shell.CONTACTS_WORKBOOK_CONVERSATIONS_WITHOUT_CONTACTS)} (${this.conversationsWithoutContactsCount()})`;
  }

  protected contactsWithoutConversationsTabLabel(): string {
    return `${this.t(I18N_KEYS.shell.CONTACTS_WORKBOOK_CONTACTS_WITHOUT_CONVERSATIONS)} (${this.contactsWithoutConversationsCount()})`;
  }

  protected selectWorkbookTab(tab: ContactsWorkbookTab): void {
    this.activeWorkbookTabState.set(tab);
    this.syncSelectionWithVisibleRows();
  }

  protected isWorkbookTabActive(tab: ContactsWorkbookTab): boolean {
    return this.activeWorkbookTabState() === tab;
  }

  protected contactNameHeaderLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_CONTACT_NAME_HEADER);
  }

  protected phoneNumbersHeaderLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_PHONE_NUMBERS_HEADER);
  }

  protected countryHeaderLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_COUNTRY_HEADER);
  }

  protected contactsLoadingLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_LOADING);
  }

  protected contactsErrorLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_ERROR);
  }

  protected contactsEmptyLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_TABLE_EMPTY);
  }

  protected onSortToggle(field: ContactsSortField): void {
    const current = this.sortState();
    let next: ContactsSortState;

    if (current.field !== field) {
      next = { field, direction: 'asc' };
    } else if (current.direction === 'asc') {
      next = { field, direction: 'desc' };
    } else if (current.direction === 'desc') {
      next = { field: null, direction: null };
    } else {
      next = { field, direction: 'asc' };
    }

    this.sortState.set(next);
    this.syncSelectionWithVisibleRows();
  }

  protected isSortActive(field: ContactsSortField): boolean {
    const state = this.sortState();
    return state.field === field && state.direction !== null;
  }

  protected getSortIcon(field: ContactsSortField): string {
    const state = this.sortState();

    if (state.field !== field || state.direction === null) {
      return 'swap_vert';
    }

    return state.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  protected getSortAriaLabel(field: ContactsSortField): string {
    const state = this.sortState();
    const fieldLabel = this.sortFieldLabel(field);

    if (state.field === field && state.direction === 'asc') {
      return `${this.t(I18N_KEYS.shell.CONTACTS_SORT_DESC)} ${fieldLabel}`;
    }

    if (state.field === field && state.direction === 'desc') {
      return `${this.t(I18N_KEYS.shell.CONTACTS_SORT_DISABLED)} ${fieldLabel}`;
    }

    return `${this.t(I18N_KEYS.shell.CONTACTS_SORT_ASC)} ${fieldLabel}`;
  }

  private sortFieldLabel(field: ContactsSortField): string {
    if (field === 'contactName') {
      return this.contactNameHeaderLabel();
    }

    if (field === 'phoneNumbers') {
      return this.phoneNumbersHeaderLabel();
    }

    return this.countryHeaderLabel();
  }

  protected contactNameValue(contact: ContactRow): string {
    return contact.contactName ?? this.t(I18N_KEYS.shell.CONTACTS_TABLE_UNKNOWN_NAME);
  }

  protected selectRow(contact: ContactRow): void {
    this.selectedRowIdState.set(contact.id);
  }

  protected isRowSelected(contact: ContactRow): boolean {
    return this.selectedRowId() === contact.id;
  }

  protected onTableKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    const rows = this.visibleRows();
    if (rows.length === 0) {
      return;
    }

    event.preventDefault();

    const currentId = this.selectedRowIdState();
    const currentIndex = rows.findIndex((row) => row.id === currentId);
    const fallbackIndex = event.key === 'ArrowUp' ? rows.length - 1 : 0;
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(baseIndex + 1, rows.length - 1)
        : Math.max(baseIndex - 1, 0);
    const nextRow = rows[nextIndex];

    if (!nextRow) {
      return;
    }

    this.selectedRowIdState.set(nextRow.id);
  }

  protected onTableContainerClick(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    target.focus();
  }

  protected phoneNumbersValue(contact: ContactRow): string {
    if (contact.phoneNumbers.length === 0) {
      return '-';
    }

    return contact.phoneNumbers.join(', ');
  }

  protected trackByContact(_index: number, contact: ContactRow): string {
    return contact.id;
  }

  protected trackByCountryFlag(_index: number, country: ContactCountryView): string {
    return country.countryCode;
  }

  protected countryFlags(contact: ContactRow): ContactCountryView[] {
    const countryCodes = this.countryCodesForContact(contact, this.countryCodeByPhoneState());

    return countryCodes.map((countryCode) => ({
      countryCode,
      label: this.countryLabel(countryCode),
      flagSvgUrl: this.inlineFlagSvgUrl(countryCode)
    }));
  }

  protected countryCellValue(contact: ContactRow): string {
    const countries = this.countryFlags(contact);
    if (countries.length === 0) {
      return '-';
    }

    return countries.map((country) => country.label).join(', ');
  }

  private async loadWorkbookData(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(false);
    this.countryCodeByPhoneState.set({});

    try {
      const [, conversationSummaries] = await Promise.all([
        this.contactsDirectoryStore.ensureLoaded(),
        firstValueFrom(this.conversationsApiService.getConversationIds())
      ]);
      const contacts = this.contactsDirectoryStore.contacts();

      if (this.contactsDirectoryStore.hasError()) {
        throw new Error('Unable to load contacts from ContactsDirectoryStore');
      }

      const mappedContacts = this.mapContactRows(contacts);
      const conversationIds = this.extractConversationIds(conversationSummaries);
      const groups = this.buildWorkbookGroups(mappedContacts, conversationIds);
      const allRows = [
        ...groups.contactsWithConversations,
        ...groups.conversationsWithoutContacts,
        ...groups.contactsWithoutConversations
      ];

      this.groupedRowsState.set(groups);
      this.syncSelectionWithVisibleRows();
      this.selectContactByPhoneSlug();
      this.loadingState.set(false);
      void this.resolveCountryCodesForRows(allRows);
    } catch (error: unknown) {
      console.error('Unable to load contacts workbook data', error);
      this.groupedRowsState.set(createEmptyWorkbookGroups());
      this.selectedRowIdState.set(null);
      this.errorState.set(true);
      this.loadingState.set(false);
    }
  }

  private syncSelectionWithVisibleRows(): void {
    const rows = this.visibleRows();
    if (rows.length === 0) {
      this.selectedRowIdState.set(null);
      return;
    }

    const currentId = this.selectedRowIdState();
    const hasCurrentSelection = currentId !== null && rows.some((row) => row.id === currentId);
    if (!hasCurrentSelection) {
      this.selectedRowIdState.set(rows[0]?.id ?? null);
    }
  }

  private selectContactByPhoneSlug(): void {
    const phoneSlug = this.selectedPhoneSlugState();
    if (!phoneSlug) {
      return;
    }

    const normalizedPhone = this.phoneFromSlug(phoneSlug);
    if (!normalizedPhone) {
      return;
    }

    const targetDigits = normalizedPhone.replace(/\D+/g, '');
    if (targetDigits.length === 0) {
      return;
    }

    const groups = this.groupedRowsState();
    const orderedTabs: ContactsWorkbookTab[] = [
      'contactsWithConversations',
      'contactsWithoutConversations',
      'conversationsWithoutContacts'
    ];

    for (const tab of orderedTabs) {
      const rows = groups[tab];
      const matchedRow = rows.find((row) =>
        row.phoneNumbers.some((phone) => phonesMatchDigits(phone.replace(/\D+/g, ''), targetDigits))
      );

      if (!matchedRow) {
        continue;
      }

      this.activeWorkbookTabState.set(tab);
      this.selectedRowIdState.set(matchedRow.id);
      this.scrollSelectedRowToCenter();
      return;
    }
  }

  private scrollSelectedRowToCenter(): void {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const container = this.spreadsheetTableScrollRef?.nativeElement;
        const selectedRowId = this.selectedRowIdState();

        if (!container || !selectedRowId) {
          return;
        }

        const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('tr.contact-row'));
        const targetRow =
          rows.find((row) => row.dataset['rowId'] === selectedRowId) ?? null;

        if (!targetRow) {
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const rowRect = targetRow.getBoundingClientRect();
        const targetScrollTop =
          container.scrollTop +
          (rowRect.top - containerRect.top) -
          (container.clientHeight / 2 - rowRect.height / 2);

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      });
    });
  }

  private normalizePhoneSlug(phoneSlug: string | null | undefined): string | null {
    if (!phoneSlug) {
      return null;
    }

    const normalized = phoneSlug.trim().toLowerCase();

    if (/^plus-\d+$/.test(normalized)) {
      return normalized;
    }

    if (/^\d+$/.test(normalized)) {
      return normalized;
    }

    return null;
  }

  private phoneFromSlug(phoneSlug: string): string | null {
    if (/^plus-\d+$/.test(phoneSlug)) {
      return `+${phoneSlug.slice('plus-'.length)}`;
    }

    if (/^\d+$/.test(phoneSlug)) {
      return phoneSlug;
    }

    return null;
  }

  private extractConversationIds(summaries: BackendConversationSummary[]): string[] {
    if (!Array.isArray(summaries)) {
      return [];
    }

    return summaries
      .map((summary) => summary.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }

  private buildWorkbookGroups(
    contacts: ContactRow[],
    conversationIds: string[]
  ): ContactsWorkbookGroups {
    const conversations = conversationIds.map((id) => this.toConversationEntry(id));
    const matchedConversationIds = new Set<string>();
    const contactsWithConversations: ContactRow[] = [];
    const contactsWithoutConversations: ContactRow[] = [];

    for (const contact of contacts) {
      const contactPhoneDigits = this.contactPhoneDigits(contact);
      const hasConversation = conversations.some((conversation) => {
        if (!conversation.phoneDigits) {
          return false;
        }

        const matched = contactPhoneDigits.some((digits) =>
          phonesMatchDigits(digits, conversation.phoneDigits!)
        );

        if (matched) {
          matchedConversationIds.add(conversation.id);
        }

        return matched;
      });

      if (hasConversation) {
        contactsWithConversations.push(contact);
      } else {
        contactsWithoutConversations.push(contact);
      }
    }

    const conversationsWithoutContacts = conversations
      .filter((conversation) => !matchedConversationIds.has(conversation.id))
      .map((conversation, index) => this.toConversationOnlyRow(conversation, index));

    return {
      contactsWithConversations,
      conversationsWithoutContacts,
      contactsWithoutConversations
    };
  }

  private toConversationEntry(conversationId: string): ConversationComparisonEntry {
    const normalizedConversationId = normalizeConversationSourceId(conversationId);
    const canonicalPhone = canonicalizePhoneNumber(normalizedConversationId);

    if (canonicalPhone) {
      return {
        id: conversationId,
        displayName: canonicalPhone.normalizedValue,
        normalizedPhone: canonicalPhone.normalizedValue,
        phoneDigits: canonicalPhone.digitsOnly
      };
    }

    const fallbackDigits = normalizedConversationId.replace(/\D+/g, '');
    if (fallbackDigits.length > 0) {
      return {
        id: conversationId,
        displayName: normalizedConversationId || conversationId,
        normalizedPhone: normalizedConversationId.includes('+')
          ? `+${fallbackDigits}`
          : fallbackDigits,
        phoneDigits: fallbackDigits
      };
    }

    return {
      id: conversationId,
      displayName: normalizedConversationId || conversationId,
      normalizedPhone: null,
      phoneDigits: null
    };
  }

  private toConversationOnlyRow(
    conversation: ConversationComparisonEntry,
    index: number
  ): ContactRow {
    return {
      id: `conversation-only|${conversation.id}|${index}`,
      contactName: conversation.displayName || conversation.id,
      phoneNumbers: conversation.normalizedPhone ? [conversation.normalizedPhone] : []
    };
  }

  private contactPhoneDigits(contact: ContactRow): string[] {
    const values = new Set<string>();

    for (const phone of contact.phoneNumbers) {
      const digits = phone.replace(/\D+/g, '');
      if (!digits) {
        continue;
      }

      values.add(digits);
    }

    return Array.from(values);
  }

  private mapContactRows(contacts: BackendContact[]): ContactRow[] {
    return contacts.map((contact, index) => {
      const contactName = this.pickFirstName(contact.names);
      const phoneNumbers = this.normalizePhoneNumbers(contact.phoneNumbers);

      return {
        id: `${contactName ?? 'unknown'}|${phoneNumbers.join('|')}|${index}`,
        contactName,
        phoneNumbers
      };
    });
  }

  private pickFirstName(names: string[]): string | null {
    for (const name of names) {
      if (typeof name !== 'string') {
        continue;
      }

      const normalizedName = name.trim();
      if (normalizedName.length > 0) {
        return normalizedName;
      }
    }

    return null;
  }

  private normalizePhoneNumbers(phoneNumbers: string[]): string[] {
    const canonicalNumbers = phoneNumbers
      .map((phone) => canonicalizePhoneNumber(phone))
      .filter((phone): phone is CanonicalPhoneNumber => phone !== null);
    const redundantNumbers = new Set<string>();
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const candidate of canonicalNumbers) {
      const isRedundant = canonicalNumbers.some(
        (other) =>
          other !== candidate &&
          this.isCountryPrefixVariant(candidate.digitsOnly, other.digitsOnly)
      );

      if (isRedundant) {
        redundantNumbers.add(candidate.normalizedValue);
      }
    }

    for (const phone of canonicalNumbers) {
      if (redundantNumbers.has(phone.normalizedValue)) {
        continue;
      }

      if (seen.has(phone.normalizedValue)) {
        continue;
      }

      seen.add(phone.normalizedValue);
      normalized.push(phone.normalizedValue);
    }

    return normalized;
  }

  private isCountryPrefixVariant(shorterDigits: string, longerDigits: string): boolean {
    if (!shorterDigits || !longerDigits) {
      return false;
    }

    if (shorterDigits.length >= longerDigits.length) {
      return false;
    }

    if (!longerDigits.endsWith(shorterDigits)) {
      return false;
    }

    const prefixLength = longerDigits.length - shorterDigits.length;
    return prefixLength >= 1 && prefixLength <= 4;
  }

  private sortContacts(
    contacts: ContactRow[],
    sortState: ContactsSortState,
    countryCodeByPhone: Record<string, string | null>,
    language: 'es' | 'en'
  ): ContactRow[] {
    const sortField = sortState.field;
    if (!sortField || !sortState.direction) {
      return contacts;
    }

    const collator = new Intl.Collator(language, {
      sensitivity: 'base',
      numeric: true
    });
    const sorted = [...contacts].sort((left, right) => {
      if (sortField === 'contactName') {
        const leftUnknown = !(left.contactName?.trim());
        const rightUnknown = !(right.contactName?.trim());

        if (leftUnknown !== rightUnknown) {
          return leftUnknown ? 1 : -1;
        }

        const leftName = left.contactName?.trim() ?? '';
        const rightName = right.contactName?.trim() ?? '';
        const byName = collator.compare(leftName, rightName);
        if (byName !== 0) {
          return byName;
        }

        const leftPhones = left.phoneNumbers.join(',');
        const rightPhones = right.phoneNumbers.join(',');
        return collator.compare(leftPhones, rightPhones);
      }

      if (sortField === 'country') {
        const leftCodes = this.countryCodesForContact(left, countryCodeByPhone);
        const rightCodes = this.countryCodesForContact(right, countryCodeByPhone);
        const leftHasCodes = leftCodes.length > 0;
        const rightHasCodes = rightCodes.length > 0;

        if (leftHasCodes !== rightHasCodes) {
          return leftHasCodes ? -1 : 1;
        }

        return collator.compare(leftCodes.join(','), rightCodes.join(','));
      }

      if (sortField === 'phoneNumbers') {
        const leftFirstPhone = left.phoneNumbers[0] ?? '';
        const rightFirstPhone = right.phoneNumbers[0] ?? '';
        const leftHasPhone = leftFirstPhone.length > 0;
        const rightHasPhone = rightFirstPhone.length > 0;

        if (leftHasPhone !== rightHasPhone) {
          return leftHasPhone ? -1 : 1;
        }

        const byFirstPhone = collator.compare(leftFirstPhone, rightFirstPhone);
        if (byFirstPhone !== 0) {
          return byFirstPhone;
        }

        const leftName = left.contactName?.trim() ?? '';
        const rightName = right.contactName?.trim() ?? '';
        return collator.compare(leftName, rightName);
      }

      return 0;
    });

    if (sortState.direction === 'desc') {
      sorted.reverse();
    }

    return sorted;
  }

  private async resolveCountryCodesForRows(rows: ContactRow[]): Promise<void> {
    const currentMap = this.countryCodeByPhoneState();
    const allPhonesWithCountryCode = Array.from(
      new Set(
        rows
          .flatMap((row) => row.phoneNumbers)
          .filter((phone) => phone.startsWith('+'))
      )
    );
    const missingPhones = allPhonesWithCountryCode.filter((phone) => currentMap[phone] === undefined);

    if (missingPhones.length === 0) {
      return;
    }

    const resolved = { ...currentMap };
    const concurrency = Math.min(8, missingPhones.length);
    let nextIndex = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIndex < missingPhones.length) {
        const index = nextIndex;
        nextIndex += 1;
        const phone = missingPhones[index];

        if (!phone) {
          continue;
        }

        resolved[phone] = await this.lookupCountryCodeForPhone(phone);
      }
    });

    await Promise.all(workers);
    this.countryCodeByPhoneState.set(resolved);
  }

  private async lookupCountryCodeForPhone(phone: string): Promise<string | null> {
    try {
      const lookup = await firstValueFrom(this.conversationsApiService.getPhonePrefix(phone));
      return this.normalizeCountryCode(lookup);
    } catch {
      return null;
    }
  }

  private normalizeCountryCode(lookup: PhonePrefixLookupResponse): string | null {
    const countryCode = lookup.countryCode?.trim().toUpperCase();

    if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
      return null;
    }

    return countryCode;
  }

  private countryCodesForContact(
    contact: ContactRow,
    countryCodeByPhone: Record<string, string | null>
  ): string[] {
    const codes = new Set<string>();

    for (const phone of contact.phoneNumbers) {
      const code = countryCodeByPhone[phone];

      if (!code) {
        continue;
      }

      codes.add(code);
    }

    return Array.from(codes).sort((left, right) => left.localeCompare(right));
  }

  private countryLabel(countryCode: string): string {
    const countryName = this.phoneCountryI18nService.getCountryName(countryCode, this.selectedLanguage());

    if (!countryName) {
      return countryCode;
    }

    return `${countryCode} - ${countryName}`;
  }

  private inlineFlagSvgUrl(countryCode: string): string {
    const flagEmoji = buildFlagEmoji(countryCode);
    const label = this.countryLabel(countryCode);
    const escapedLabel = this.escapeXml(label);
    const escapedEmoji = this.escapeXml(flagEmoji);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="20" viewBox="0 0 28 20" role="img" aria-label="${escapedLabel}">`,
      `<text x="14" y="58%" text-anchor="middle" font-size="15.6" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapedEmoji}</text>`,
      `</svg>`
    ].join('');

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private t(key: (typeof I18N_KEYS)['shell'][keyof (typeof I18N_KEYS)['shell']]): string {
    return this.i18nService.get(key, this.selectedLanguage());
  }
}

type ContactRow = {
  id: string;
  contactName: string | null;
  phoneNumbers: string[];
};

type CanonicalPhoneNumber = {
  normalizedValue: string;
  digitsOnly: string;
  hasCountryCode: boolean;
};

type ContactCountryView = {
  countryCode: string;
  label: string;
  flagSvgUrl: string;
};

type ContactsSortField = 'contactName' | 'phoneNumbers' | 'country';

type ContactsSortState = {
  field: ContactsSortField | null;
  direction: 'asc' | 'desc' | null;
};

type ContactsWorkbookTab =
  | 'contactsWithConversations'
  | 'conversationsWithoutContacts'
  | 'contactsWithoutConversations';

type ContactsWorkbookGroups = Record<ContactsWorkbookTab, ContactRow[]>;

type ConversationComparisonEntry = {
  id: string;
  displayName: string;
  normalizedPhone: string | null;
  phoneDigits: string | null;
};

function createEmptyWorkbookGroups(): ContactsWorkbookGroups {
  return {
    contactsWithConversations: [],
    conversationsWithoutContacts: [],
    contactsWithoutConversations: []
  };
}

function buildFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .slice(0, 2)
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}
