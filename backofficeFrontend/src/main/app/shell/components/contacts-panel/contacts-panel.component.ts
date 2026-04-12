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
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  ConversationsApiService,
  type BackendConversationSummary
} from '../../../core/api/services/conversations-api.service';
import {
  ContactsApiService,
  type CreateContactResponse,
  type BackendContact,
  type DeleteContactRequestItem,
  type PatchContactRequest
} from '../../../core/api/services/contacts-api.service';
import { I18nService } from '../../../core/i18n/services/i18n.service';
import { I18nStateService } from '../../../core/i18n/services/i18n-state.service';
import { PhoneCountryI18nService } from '../../../core/i18n/services/phone-country-i18n.service';
import { I18N_KEYS } from '../../../core/i18n/translations/i18n-keys.const';
import { ContactsDirectoryStore } from '../../../core/state/contacts-directory.store';
import { ContactDeleteConfirmModalComponent } from '../../../shared/components/contact-delete-confirm-modal/contact-delete-confirm-modal.component';
import { PhonePrefixCacheService } from '../../../core/api/services/phone-prefix-cache.service';
import { ContactFormatValidatorService } from '../../../core/validation/services/contact-format-validator.service';
import { RecommendedNesContactNameService } from '../../services/recommended-nes-contact-name.service';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId,
  phonesMatchDigits
} from '../../../core/phone/phone-normalization.utils';

@Component({
  selector: 'app-contacts-panel',
  imports: [CommonModule, RouterLink, ContactDeleteConfirmModalComponent],
  templateUrl: './contacts-panel.component.html',
  styleUrl: './contacts-panel.component.sass'
})
export class ContactsPanelComponent implements OnInit, OnChanges {
  @Input() public selectedPhoneSlug: string | null = null;
  @Input() public selectedWorkbookPageSlug: ContactsWorkbookPageSlug | null = null;

  @ViewChild('spreadsheetTableScroll')
  private spreadsheetTableScrollRef?: ElementRef<HTMLDivElement>;

  private readonly contactsDirectoryStore = inject(ContactsDirectoryStore);
  private readonly contactsApiService = inject(ContactsApiService);
  private readonly conversationsApiService = inject(ConversationsApiService);
  private readonly i18nService = inject(I18nService);
  private readonly i18nStateService = inject(I18nStateService);
  private readonly phoneCountryI18nService = inject(PhoneCountryI18nService);
  private readonly router = inject(Router);
  private readonly phonePrefixCacheService = inject(PhonePrefixCacheService);
  private readonly contactFormatValidatorService = inject(ContactFormatValidatorService);
  private readonly recommendedNesContactNameService = inject(RecommendedNesContactNameService);

  private readonly groupedRowsState = signal<ContactsWorkbookGroups>(createEmptyWorkbookGroups());
  private readonly activeWorkbookTabState = signal<ContactsWorkbookTab>('contactsWithConversations');
  private readonly loadingState = signal<boolean>(true);
  private readonly errorState = signal<boolean>(false);
  private readonly countryCodeByPhoneState = signal<Record<string, string | null>>({});
  private readonly sortState = signal<ContactsSortState>({
    field: 'contactName',
    direction: 'asc'
  });
  private readonly selectedRowIdState = signal<string | null>(null);
  private readonly selectedPhoneSlugState = signal<string | null>(null);
  private readonly conversationIdsState = signal<string[]>([]);
  private readonly conversationFirstMessageDateByIdState = signal<Record<string, string>>({});
  private readonly editingCellState = signal<EditingCell | null>(null);
  private readonly editingDraftValueState = signal<string>('');
  private readonly deleteModalState = signal<DeleteModalState | null>(null);
  private readonly deleteInFlightState = signal<boolean>(false);
  private readonly recommendedNameByContactIdState = signal<Record<string, string>>({});
  private readonly recommendedNameLoadingByContactIdState = signal<Record<string, boolean>>({});
  private readonly createRecommendedInFlightByContactIdState = signal<Record<string, boolean>>({});

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
    if ('selectedWorkbookPageSlug' in changes) {
      const tabFromSlug = this.workbookTabFromPageSlug(this.selectedWorkbookPageSlug);
      if (tabFromSlug) {
        this.activeWorkbookTabState.set(tabFromSlug);
      }
    }

    if ('selectedPhoneSlug' in changes) {
      this.selectedPhoneSlugState.set(this.normalizePhoneSlug(this.selectedPhoneSlug));
      const selectedBySlug = this.selectContactByPhoneSlug({ smoothScroll: false });
      if (!selectedBySlug) {
        this.syncSelectionWithVisibleRows();
      }
    }
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
    this.cancelCellEditing();
    this.cancelDeleteModal();
    this.activeWorkbookTabState.set(tab);
    this.updateRouteForWorkbookTab(tab);
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
    this.cancelCellEditing();
    this.cancelDeleteModal();
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

  protected isNonCompliantContactNameCell(contact: ContactRow): boolean {
    if (this.activeWorkbookTabState() !== 'contactsWithConversations') {
      return false;
    }

    return !this.contactFormatValidatorService.isCompliant(contact.contactName);
  }

  protected shouldShowRecommendedNameButton(contact: ContactRow): boolean {
    return (
      this.activeWorkbookTabState() === 'conversationsWithoutContacts' &&
      typeof contact.chatConversationId === 'string' &&
      contact.chatConversationId.trim().length > 0
    );
  }

  protected recommendedNameTooltipValue(contact: ContactRow): string | null {
    const recommendedByContactId = this.recommendedNameByContactIdState();
    return recommendedByContactId[contact.id] ?? null;
  }

  protected onRecommendedNameButtonMouseEnter(contact: ContactRow): void {
    void this.ensureRecommendedNameForContact(contact);
  }

  protected onRecommendedNameButtonClick(event: MouseEvent, contact: ContactRow): void {
    event.stopPropagation();
    void this.createRecommendedContact(contact);
  }

  protected isCreateRecommendedInFlight(contact: ContactRow): boolean {
    const inFlightByContactId = this.createRecommendedInFlightByContactIdState();
    return inFlightByContactId[contact.id] === true;
  }

  protected chatRouteForContact(contact: ContactRow): string[] | null {
    const conversationId = contact.chatConversationId?.trim();
    if (!conversationId) {
      return null;
    }

    const normalizedConversationId = normalizeConversationSourceId(conversationId).trim();
    if (!normalizedConversationId) {
      return null;
    }

    const canonicalConversationPhone = canonicalizePhoneNumber(normalizedConversationId);
    const routeSlug = canonicalConversationPhone?.digitsOnly ?? normalizedConversationId.replace(/^\+/, '');

    if (!routeSlug) {
      return null;
    }

    return ['/chat', routeSlug];
  }

  protected selectRow(contact: ContactRow): void {
    this.selectedRowIdState.set(contact.id);
  }

  protected isRowSelected(contact: ContactRow): boolean {
    return this.selectedRowId() === contact.id;
  }

  protected onTableKeydown(event: KeyboardEvent): void {
    if (this.editingCellState()) {
      return;
    }

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

  protected isEditingCell(contact: ContactRow): boolean {
    const editingCell = this.editingCellState();
    return editingCell?.contactId === contact.id;
  }

  protected editingDraftValue(): string {
    return this.editingDraftValueState();
  }

  protected isRowEditing(contact: ContactRow): boolean {
    return this.editingCellState()?.contactId === contact.id;
  }

  protected canDeleteContactEntry(contact: ContactRow): boolean {
    return this.buildDeleteRequestItem(contact) !== null;
  }

  protected deleteEntryAriaLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_DELETE_ENTRY_ARIA);
  }

  protected isDeleteModalOpen(): boolean {
    return this.deleteModalState() !== null;
  }

  protected deleteModalTitle(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_DELETE_MODAL_TITLE);
  }

  protected deleteModalMessage(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_DELETE_MODAL_MESSAGE);
  }

  protected deleteModalConfirmLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_DELETE_MODAL_CONFIRM);
  }

  protected deleteModalCancelLabel(): string {
    return this.t(I18N_KEYS.shell.CONTACTS_DELETE_MODAL_CANCEL);
  }

  protected onCellDoubleClick(contact: ContactRow): void {
    if (!this.hasPatchableResourceName(contact)) {
      return;
    }

    this.selectRow(contact);
    this.startCellEditing(contact);
  }

  protected onEditInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.editingDraftValueState.set(target.value);
  }

  protected onEditKeydown(event: KeyboardEvent, contact: ContactRow): void {
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelCellEditing();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void this.commitCellEditing(contact);
  }

  protected onDeleteEntryClick(event: MouseEvent, contact: ContactRow): void {
    event.stopPropagation();

    const deleteRequestItem = this.buildDeleteRequestItem(contact);
    if (!deleteRequestItem || this.deleteInFlightState()) {
      return;
    }

    this.deleteModalState.set({
      contactId: contact.id,
      deleteRequestItem
    });
  }

  protected cancelDeleteModal(): void {
    if (this.deleteInFlightState()) {
      return;
    }

    this.deleteModalState.set(null);
  }

  protected confirmDeleteFromModal(): void {
    void this.confirmDeleteContact();
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
    this.conversationIdsState.set([]);
    this.conversationFirstMessageDateByIdState.set({});
    this.recommendedNameByContactIdState.set({});
    this.recommendedNameLoadingByContactIdState.set({});
    this.createRecommendedInFlightByContactIdState.set({});

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
      this.conversationIdsState.set(conversationIds);
      this.conversationFirstMessageDateByIdState.set(
        this.mapConversationFirstMessageDateByConversationId(conversationSummaries)
      );
      const groups = this.buildWorkbookGroups(mappedContacts, conversationIds);
      const allRows = [
        ...groups.contactsWithConversations,
        ...groups.conversationsWithoutContacts,
        ...groups.contactsWithoutConversations
      ];

      this.groupedRowsState.set(groups);
      const selectedBySlug = this.selectContactByPhoneSlug({ smoothScroll: false });
      if (!selectedBySlug) {
        this.syncSelectionWithVisibleRows();
      }
      this.loadingState.set(false);
      void this.resolveCountryCodesForRows(allRows);
    } catch (error: unknown) {
      console.error('Unable to load contacts workbook data', error);
      this.groupedRowsState.set(createEmptyWorkbookGroups());
      this.conversationIdsState.set([]);
      this.selectedRowIdState.set(null);
      this.errorState.set(true);
      this.loadingState.set(false);
    }
  }

  private startCellEditing(contact: ContactRow): void {
    const draftValue = contact.contactName ?? '';
    this.editingCellState.set({
      contactId: contact.id
    });
    this.editingDraftValueState.set(draftValue);
    this.focusEditingInput(contact.id);
  }

  private focusEditingInput(contactId: string): void {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const selector = `input[data-edit-contact-id=\"${this.escapeForCssSelector(contactId)}\"]`;
        const input = document.querySelector<HTMLInputElement>(selector);
        if (!input) {
          return;
        }

        input.focus();
        input.select();
      });
    });
  }

  private escapeForCssSelector(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private cancelCellEditing(): void {
    this.editingCellState.set(null);
    this.editingDraftValueState.set('');
  }

  private async ensureRecommendedNameForContact(contact: ContactRow): Promise<void> {
    const cachedNames = this.recommendedNameByContactIdState();
    if (cachedNames[contact.id]) {
      return;
    }

    const loadingByContactId = this.recommendedNameLoadingByContactIdState();
    if (loadingByContactId[contact.id]) {
      return;
    }

    this.recommendedNameLoadingByContactIdState.set({
      ...loadingByContactId,
      [contact.id]: true
    });

    try {
      const conversationId = contact.chatConversationId?.trim() ?? '';
      const firstMessageDateByConversationId = this.conversationFirstMessageDateByIdState();
      const firstMessageDate =
        conversationId.length > 0 ? firstMessageDateByConversationId[conversationId] ?? null : null;
      const recommendedName = await this.recommendedNesContactNameService.buildRecommendedName({
        phoneNumbers: [...contact.phoneNumbers],
        chatConversationId: contact.chatConversationId,
        firstMessageDate
      });

      const latestNames = this.recommendedNameByContactIdState();
      this.recommendedNameByContactIdState.set({
        ...latestNames,
        [contact.id]: recommendedName
      });
    } catch (error: unknown) {
      console.error('Unable to build recommended contact name', error);
    } finally {
      const latestLoadingByContactId = this.recommendedNameLoadingByContactIdState();
      if (!latestLoadingByContactId[contact.id]) {
        return;
      }

      const { [contact.id]: _, ...nextLoadingByContactId } = latestLoadingByContactId;
      this.recommendedNameLoadingByContactIdState.set(nextLoadingByContactId);
    }
  }

  private async createRecommendedContact(contact: ContactRow): Promise<void> {
    const inFlightByContactId = this.createRecommendedInFlightByContactIdState();
    if (inFlightByContactId[contact.id]) {
      return;
    }

    this.createRecommendedInFlightByContactIdState.set({
      ...inFlightByContactId,
      [contact.id]: true
    });

    try {
      await this.ensureRecommendedNameForContact(contact);
      const recommendedName = this.recommendedNameByContactIdState()[contact.id]?.trim() ?? '';
      const phoneNumber = this.resolvePhoneForContactCreate(contact);

      if (!recommendedName || !phoneNumber) {
        return;
      }

      const response = await firstValueFrom(
        this.contactsApiService.createContact({
          names: [recommendedName],
          phoneNumbers: [phoneNumber]
        })
      );

      this.rebuildWorkbookAfterCreate(contact.id, response);
      this.syncSelectionWithVisibleRows();
      void this.resolveCountryCodesForRows(this.visibleRows());
    } catch (error: unknown) {
      console.error('Unable to create contact from recommendation', error);
    } finally {
      const latestInFlightByContactId = this.createRecommendedInFlightByContactIdState();
      const { [contact.id]: _, ...nextInFlightByContactId } = latestInFlightByContactId;
      this.createRecommendedInFlightByContactIdState.set(nextInFlightByContactId);
    }
  }

  private resolvePhoneForContactCreate(contact: ContactRow): string | null {
    const firstPhone = contact.phoneNumbers.find(
      (phone) => typeof phone === 'string' && phone.trim().length > 0
    );
    if (firstPhone) {
      return firstPhone.trim();
    }

    const conversationId = contact.chatConversationId?.trim();
    if (!conversationId) {
      return null;
    }

    const normalizedConversationId = normalizeConversationSourceId(conversationId);
    const canonicalConversationPhone = canonicalizePhoneNumber(normalizedConversationId);

    return canonicalConversationPhone?.normalizedValue ?? null;
  }

  private async commitCellEditing(contact: ContactRow): Promise<void> {
    const editingCell = this.editingCellState();
    if (!editingCell || editingCell.contactId !== contact.id) {
      return;
    }

    const resourceName = this.normalizeResourceName(contact.resourceName);
    if (!resourceName) {
      this.cancelCellEditing();
      return;
    }

    const currentName = (contact.contactName ?? '').trim();
    const newName = this.editingDraftValueState().trim();
    const hasChanges = newName !== currentName;

    this.cancelCellEditing();

    if (!hasChanges) {
      return;
    }

    const patchRequest: PatchContactRequest = {
      names: newName.length > 0 ? [newName] : []
    };

    try {
      const patchResult = await firstValueFrom(
        this.contactsApiService.patchContact(resourceName, patchRequest)
      );
      this.rebuildWorkbookAfterPatch(contact.id, {
        contactName: newName,
        phoneNumbers: [...contact.phoneNumbers],
        resourceName:
          typeof patchResult.contact.resourceName === 'string' &&
          patchResult.contact.resourceName.trim().length > 0
            ? patchResult.contact.resourceName.trim()
            : resourceName
      });
      this.syncSelectionWithVisibleRows();
      void this.resolveCountryCodesForRows(this.visibleRows());
    } catch (error: unknown) {
      console.error('Unable to patch contact after inline edition', error);
    }
  }

  private async confirmDeleteContact(): Promise<void> {
    const modalState = this.deleteModalState();
    if (!modalState || this.deleteInFlightState()) {
      return;
    }

    this.deleteInFlightState.set(true);

    try {
      await firstValueFrom(this.contactsApiService.deleteContacts([modalState.deleteRequestItem]));
      this.cancelCellEditing();
      this.removeContactFromWorkbook(modalState.contactId);
      this.removeContactFromStore(modalState.deleteRequestItem);
      this.syncSelectionWithVisibleRows();
      this.deleteModalState.set(null);
    } catch (error: unknown) {
      console.error('Unable to delete contact entry', error);
    } finally {
      this.deleteInFlightState.set(false);
    }
  }

  private removeContactFromWorkbook(contactId: string): void {
    const currentGroups = this.groupedRowsState();
    const nextGroups: ContactsWorkbookGroups = {
      contactsWithConversations: currentGroups.contactsWithConversations.filter((row) => row.id !== contactId),
      conversationsWithoutContacts: currentGroups.conversationsWithoutContacts.filter((row) => row.id !== contactId),
      contactsWithoutConversations: currentGroups.contactsWithoutConversations.filter((row) => row.id !== contactId)
    };

    this.groupedRowsState.set(nextGroups);

    if (this.selectedRowIdState() === contactId) {
      this.selectedRowIdState.set(null);
    }
  }

  private removeContactFromStore(deleteRequestItem: DeleteContactRequestItem): void {
    const nameToDelete = (deleteRequestItem.nameToDelete ?? '').trim();
    const phoneToDelete = (deleteRequestItem.phoneToDelete ?? '').trim();
    const targetPhoneDigits = phoneToDelete.replace(/\D+/g, '');

    this.contactsDirectoryStore.removeFirstMatching((contact) => {
      const candidateName = this.pickFirstName(contact.names) ?? '';
      const candidateNameMatches = nameToDelete.length > 0 ? candidateName === nameToDelete : true;

      if (!candidateNameMatches) {
        return false;
      }

      if (targetPhoneDigits.length === 0) {
        return true;
      }

      return contact.phoneNumbers.some((phone) =>
        phonesMatchDigits(phone.replace(/\D+/g, ''), targetPhoneDigits)
      );
    });
  }

  private buildDeleteRequestItem(contact: ContactRow): DeleteContactRequestItem | null {
    const nameToDelete = (contact.contactName ?? '').trim();
    const phoneToDelete = (contact.phoneNumbers[0] ?? '').trim();

    if (nameToDelete.length === 0 && phoneToDelete.length === 0) {
      return null;
    }

    return {
      nameToDelete: nameToDelete.length > 0 ? nameToDelete : undefined,
      phoneToDelete: phoneToDelete.length > 0 ? phoneToDelete : undefined
    };
  }

  private rebuildWorkbookAfterPatch(contactId: string, edition: ContactEdition): void {
    const currentGroups = this.groupedRowsState();
    const mergedExistingContacts = [
      ...currentGroups.contactsWithConversations,
      ...currentGroups.contactsWithoutConversations
    ]
      .map((row) => (row.id === contactId ? { ...row, ...edition } : row))
      .map((row) => ({ ...row, chatConversationId: null }));
    const editedConversationOnlyRow = currentGroups.conversationsWithoutContacts.find(
      (row) => row.id === contactId
    );

    if (editedConversationOnlyRow) {
      mergedExistingContacts.push({
        id: contactId,
        contactName: edition.contactName.trim().length > 0 ? edition.contactName.trim() : null,
        phoneNumbers: edition.phoneNumbers,
        resourceName: edition.resourceName,
        chatConversationId: null
      });
    }

    const nextStoreContacts: BackendContact[] = mergedExistingContacts.map((row) => ({
      resourceName: row.resourceName,
      names: row.contactName ? [row.contactName] : [],
      phoneNumbers: [...row.phoneNumbers]
    }));
    this.contactsDirectoryStore.replaceContacts(nextStoreContacts);

    const conversationIds = this.resolveConversationIdsForRebuild(currentGroups);
    const nextGroups = this.buildWorkbookGroups(mergedExistingContacts, conversationIds);
    const preferredSelectionId = this.resolvePreferredSelectionIdAfterRebuild(
      nextGroups,
      contactId,
      edition
    );

    this.groupedRowsState.set(nextGroups);
    this.selectedRowIdState.set(preferredSelectionId);
  }

  private rebuildWorkbookAfterCreate(
    sourceConversationOnlyRowId: string,
    response: CreateContactResponse
  ): void {
    const currentGroups = this.groupedRowsState();
    const mergedExistingContacts = [
      ...currentGroups.contactsWithConversations,
      ...currentGroups.contactsWithoutConversations
    ].map((row) => ({ ...row, chatConversationId: null }));
    const createdRow: ContactRow = {
      id: `created|${response.contact.resourceName}|${mergedExistingContacts.length}`,
      contactName: this.pickFirstName(response.contact.names),
      phoneNumbers: this.normalizePhoneNumbers(response.contact.phoneNumbers),
      resourceName: response.contact.resourceName,
      chatConversationId: null
    };

    const nextContacts = [...mergedExistingContacts, createdRow];
    const conversationIds = this.resolveConversationIdsForRebuild(currentGroups);
    const nextGroups = this.buildWorkbookGroups(nextContacts, conversationIds);
    const nextStoreContacts: BackendContact[] = nextContacts.map((row) => ({
      resourceName: row.resourceName,
      names: row.contactName ? [row.contactName] : [],
      phoneNumbers: [...row.phoneNumbers]
    }));

    this.contactsDirectoryStore.replaceContacts(nextStoreContacts);
    this.groupedRowsState.set(nextGroups);

    if (this.selectedRowIdState() === sourceConversationOnlyRowId) {
      this.selectedRowIdState.set(null);
    }
  }

  private resolveConversationIdsForRebuild(currentGroups: ContactsWorkbookGroups): string[] {
    const storedConversationIds = this.conversationIdsState();
    if (storedConversationIds.length > 0) {
      return storedConversationIds;
    }

    const discoveredConversationIds = new Set<string>();
    for (const row of currentGroups.contactsWithConversations) {
      const conversationId = row.chatConversationId?.trim();
      if (conversationId) {
        discoveredConversationIds.add(conversationId);
      }
    }

    for (const row of currentGroups.conversationsWithoutContacts) {
      const conversationId = row.chatConversationId?.trim();
      if (conversationId) {
        discoveredConversationIds.add(conversationId);
      }
    }

    return Array.from(discoveredConversationIds);
  }

  private resolvePreferredSelectionIdAfterRebuild(
    groups: ContactsWorkbookGroups,
    editedContactId: string,
    edition: ContactEdition
  ): string | null {
    const allRows = [
      ...groups.contactsWithConversations,
      ...groups.conversationsWithoutContacts,
      ...groups.contactsWithoutConversations
    ];
    const sameId = allRows.find((row) => row.id === editedContactId);
    if (sameId) {
      return sameId.id;
    }

    const targetName = edition.contactName.trim();
    const targetPhone = edition.phoneNumbers[0] ?? '';
    const byEditedValues = allRows.find(
      (row) =>
        (row.contactName ?? '').trim() === targetName && (row.phoneNumbers[0] ?? '') === targetPhone
    );

    return byEditedValues?.id ?? null;
  }

  private hasPatchableResourceName(contact: ContactRow): boolean {
    return this.normalizeResourceName(contact.resourceName) !== null;
  }

  private normalizeResourceName(resourceName: string | undefined): string | null {
    if (typeof resourceName !== 'string') {
      return null;
    }

    const normalized = resourceName.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private workbookTabFromPageSlug(pageSlug: ContactsWorkbookPageSlug | null): ContactsWorkbookTab | null {
    if (pageSlug === 'contacts-with-conversations') {
      return 'contactsWithConversations';
    }

    if (pageSlug === 'conversations-without-contacts') {
      return 'conversationsWithoutContacts';
    }

    if (pageSlug === 'contacts-without-conversations') {
      return 'contactsWithoutConversations';
    }

    return null;
  }

  private pageSlugFromWorkbookTab(tab: ContactsWorkbookTab): ContactsWorkbookPageSlug {
    if (tab === 'contactsWithConversations') {
      return 'contacts-with-conversations';
    }

    if (tab === 'conversationsWithoutContacts') {
      return 'conversations-without-contacts';
    }

    return 'contacts-without-conversations';
  }

  private updateRouteForWorkbookTab(tab: ContactsWorkbookTab): void {
    const pageSlug = this.pageSlugFromWorkbookTab(tab);
    const currentPageSlug = this.selectedWorkbookPageSlug;

    if (currentPageSlug === pageSlug) {
      return;
    }

    void this.router.navigate(['/contacts', pageSlug], {
      queryParamsHandling: 'merge'
    });
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

  private selectContactByPhoneSlug(options?: { smoothScroll?: boolean }): boolean {
    const phoneSlug = this.selectedPhoneSlugState();
    if (!phoneSlug) {
      return false;
    }

    const normalizedPhone = this.phoneFromSlug(phoneSlug);
    if (!normalizedPhone) {
      return false;
    }

    const targetDigits = normalizedPhone.replace(/\D+/g, '');
    if (targetDigits.length === 0) {
      return false;
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
      this.scrollSelectedRowToCenter(options?.smoothScroll ?? true);
      return true;
    }

    return false;
  }

  private scrollSelectedRowToCenter(smoothScroll = true): void {
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
          behavior: smoothScroll ? 'smooth' : 'auto'
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

  private mapConversationFirstMessageDateByConversationId(
    summaries: BackendConversationSummary[]
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const summary of summaries) {
      const conversationId = typeof summary.id === 'string' ? summary.id.trim() : '';
      const firstMessageDate =
        typeof summary.firstMessageDate === 'string' ? summary.firstMessageDate.trim() : '';

      if (!conversationId || !firstMessageDate) {
        continue;
      }

      result[conversationId] = firstMessageDate;
    }

    return result;
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
      let firstMatchedConversationId: string | null = null;
      const hasConversation = conversations.some((conversation) => {
        if (!conversation.phoneDigits) {
          return false;
        }

        const matched = contactPhoneDigits.some((digits) =>
          phonesMatchDigits(digits, conversation.phoneDigits!)
        );

        if (matched) {
          matchedConversationIds.add(conversation.id);
          if (!firstMatchedConversationId) {
            firstMatchedConversationId = conversation.id;
          }
        }

        return matched;
      });

      if (hasConversation) {
        contactsWithConversations.push({
          ...contact,
          chatConversationId: firstMatchedConversationId
        });
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
      phoneNumbers: conversation.normalizedPhone ? [conversation.normalizedPhone] : [],
      resourceName: undefined,
      chatConversationId: conversation.id
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
      const resourceName =
        typeof contact.resourceName === 'string' && contact.resourceName.trim().length > 0
          ? contact.resourceName.trim()
          : undefined;

      return {
        id: `${contactName ?? 'unknown'}|${phoneNumbers.join('|')}|${index}`,
        contactName,
        phoneNumbers,
        resourceName,
        chatConversationId: null
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

    for (const phone of missingPhones) {
      resolved[phone] = await this.lookupCountryCodeForPhone(phone);
    }

    this.countryCodeByPhoneState.set(resolved);
  }

  private async lookupCountryCodeForPhone(phone: string): Promise<string | null> {
    return this.phonePrefixCacheService.resolveCountryCode(phone);
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
  resourceName?: string;
  chatConversationId: string | null;
};

type ContactEdition = {
  contactName: string;
  phoneNumbers: string[];
  resourceName?: string;
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

type ContactsWorkbookPageSlug =
  | 'contacts-with-conversations'
  | 'conversations-without-contacts'
  | 'contacts-without-conversations';

type ContactsWorkbookGroups = Record<ContactsWorkbookTab, ContactRow[]>;

type EditingCell = {
  contactId: string;
};

type DeleteModalState = {
  contactId: string;
  deleteRequestItem: DeleteContactRequestItem;
};

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
