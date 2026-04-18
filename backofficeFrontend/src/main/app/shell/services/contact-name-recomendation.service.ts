import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ContactsApiService,
  type BackendContact,
  type CreateContactResponse,
  type PatchContactResponse
} from '../../core/api/services/contacts-api.service';
import { ContactsDirectoryStore } from '../../core/state/contacts-directory.store';
import {
  normalizePhoneForContactCreate
} from '../../core/phone/contact-create-phone.utils';
import { normalizeConversationSourceId } from '../../core/phone/phone-normalization.utils';
import {
  RecommendedNesContactNameService,
  type RecommendedNameConversationInput
} from './recommended-nes-contact-name.service';

export type ContactsWorkbookTab =
  | 'contactsWithConversations'
  | 'prospectsWithConversations'
  | 'conversationsWithoutContacts'
  | 'contactsWithoutConversations';

export type BlueActionContactRow = {
  id: string;
  contactName: string | null;
  phoneNumbers: string[];
  resourceName?: string;
  chatConversationId: string | null;
};

export type BlueActionExecutionResult =
  | {
      kind: 'created';
      response: CreateContactResponse;
    }
  | {
      kind: 'renamed';
      response: PatchContactResponse;
      renamedName: string;
      resourceName: string;
    }
  | {
      kind: 'noop';
    };

@Injectable({ providedIn: 'root' })
export class ContactNameRecomendationService {
  private readonly contactsApiService = inject(ContactsApiService);
  private readonly contactsDirectoryStore = inject(ContactsDirectoryStore);
  private readonly recommendedNesContactNameService = inject(RecommendedNesContactNameService);

  private readonly recommendedNameByContactIdState = signal<Record<string, string>>({});
  private readonly recommendationLoadingByContactIdState = signal<Record<string, boolean>>({});
  private readonly inFlightByContactIdState = signal<Record<string, boolean>>({});

  public resetState(): void {
    this.recommendedNameByContactIdState.set({});
    this.recommendationLoadingByContactIdState.set({});
    this.inFlightByContactIdState.set({});
  }

  public shouldShowRecommendedNameButton(
    tab: ContactsWorkbookTab,
    contact: BlueActionContactRow
  ): boolean {
    return tab === 'conversationsWithoutContacts' && !!contact.chatConversationId?.trim();
  }

  public shouldShowLlamadaRenameButton(
    tab: ContactsWorkbookTab,
    contact: BlueActionContactRow
  ): boolean {
    if (!isContactsWithConversationsLikeTab(tab)) {
      return false;
    }

    const contactName = (contact.contactName ?? '').trim();
    if (!contactName.startsWith('Llamada ')) {
      return false;
    }

    return this.normalizeResourceName(contact.resourceName) !== null;
  }

  public shouldShowBlueActionButton(tab: ContactsWorkbookTab, contact: BlueActionContactRow): boolean {
    return this.shouldShowRecommendedNameButton(tab, contact) || this.shouldShowLlamadaRenameButton(tab, contact);
  }

  public tooltipValue(tab: ContactsWorkbookTab, contact: BlueActionContactRow): string | null {
    if (!this.shouldShowBlueActionButton(tab, contact)) {
      return null;
    }

    const recommendedName = this.recommendedNameByContactIdState()[contact.id];
    if (!recommendedName) {
      return null;
    }

    return this.finalizeRecommendedNameForTab(tab, recommendedName);
  }

  public isBlueActionDisabled(tab: ContactsWorkbookTab, contact: BlueActionContactRow): boolean {
    if (!this.shouldShowBlueActionButton(tab, contact)) {
      return true;
    }

    if (!this.shouldShowRecommendedNameButton(tab, contact)) {
      return false;
    }

    return this.resolvePhoneForContactCreate(contact) === null;
  }

  public isInFlight(contactId: string): boolean {
    return this.inFlightByContactIdState()[contactId] === true;
  }

  public async preload(
    tab: ContactsWorkbookTab,
    contact: BlueActionContactRow,
    firstMessageDate: string | null
  ): Promise<void> {
    if (!this.shouldShowBlueActionButton(tab, contact)) {
      return;
    }

    await this.ensureRecommendedName(tab, contact, firstMessageDate);
  }

  public async execute(
    tab: ContactsWorkbookTab,
    contact: BlueActionContactRow,
    firstMessageDate: string | null
  ): Promise<BlueActionExecutionResult> {
    const inFlightByContactId = this.inFlightByContactIdState();
    if (inFlightByContactId[contact.id]) {
      return { kind: 'noop' };
    }

    this.inFlightByContactIdState.set({
      ...inFlightByContactId,
      [contact.id]: true
    });

    try {
      if (this.shouldShowRecommendedNameButton(tab, contact)) {
        await this.ensureRecommendedName(tab, contact, firstMessageDate);
        const recommendedName = this.finalizeRecommendedNameForTab(
          tab,
          this.recommendedNameByContactIdState()[contact.id] ?? ''
        );
        const phoneNumber = this.resolvePhoneForContactCreate(contact);
        if (!recommendedName || !phoneNumber) {
          return { kind: 'noop' };
        }

        const response = await firstValueFrom(
          this.contactsApiService.createContact({
            names: [recommendedName],
            phoneNumbers: [phoneNumber]
          })
        );

        return { kind: 'created', response };
      }

      if (this.shouldShowLlamadaRenameButton(tab, contact)) {
        const resourceName = this.normalizeResourceName(contact.resourceName);
        await this.ensureRecommendedName(tab, contact, firstMessageDate);
        const recommendedName = this.finalizeRecommendedNameForTab(
          tab,
          this.recommendedNameByContactIdState()[contact.id] ?? ''
        );

        if (!resourceName || !recommendedName) {
          return { kind: 'noop' };
        }

        const response = await firstValueFrom(
          this.contactsApiService.patchContact(resourceName, { names: [recommendedName] })
        );

        return { kind: 'renamed', response, renamedName: recommendedName, resourceName };
      }

      return { kind: 'noop' };
    } finally {
      const latestInFlightByContactId = this.inFlightByContactIdState();
      const { [contact.id]: _, ...nextInFlightByContactId } = latestInFlightByContactId;
      this.inFlightByContactIdState.set(nextInFlightByContactId);
    }
  }

  private async ensureRecommendedName(
    tab: ContactsWorkbookTab,
    contact: BlueActionContactRow,
    firstMessageDate: string | null
  ): Promise<void> {
    const cachedNames = this.recommendedNameByContactIdState();
    if (cachedNames[contact.id]) {
      return;
    }

    const loadingByContactId = this.recommendationLoadingByContactIdState();
    if (loadingByContactId[contact.id]) {
      return;
    }

    this.recommendationLoadingByContactIdState.set({
      ...loadingByContactId,
      [contact.id]: true
    });

    try {
      const request: RecommendedNameConversationInput = {
        phoneNumbers: [...contact.phoneNumbers],
        chatConversationId: contact.chatConversationId,
        firstMessageDate
      };
      const recommendedName = await this.recommendedNesContactNameService.buildRecommendedName(request);
      const uniqueRecommendedName = this.shouldShowRecommendedNameButton(tab, contact)
        ? this.ensureUniqueRecommendedName(contact.id, recommendedName)
        : recommendedName;
      const latestNames = this.recommendedNameByContactIdState();
      this.recommendedNameByContactIdState.set({
        ...latestNames,
        [contact.id]: uniqueRecommendedName
      });
    } finally {
      const latestLoadingByContactId = this.recommendationLoadingByContactIdState();
      const { [contact.id]: _, ...nextLoadingByContactId } = latestLoadingByContactId;
      this.recommendationLoadingByContactIdState.set(nextLoadingByContactId);
    }
  }

  private resolvePhoneForContactCreate(contact: BlueActionContactRow): string | null {
    const firstPhone = contact.phoneNumbers.find((phone) => typeof phone === 'string' && phone.trim().length > 0);
    const sourcePhone = firstPhone?.trim() ?? this.resolveConversationPhone(contact.chatConversationId);
    const normalized = normalizePhoneForContactCreate(sourcePhone);

    return normalized.isValid ? normalized.normalizedPhone : null;
  }

  private resolveConversationPhone(chatConversationId: string | null): string | null {
    const conversationId = chatConversationId?.trim();
    if (!conversationId) {
      return null;
    }

    return normalizeConversationSourceId(conversationId);
  }

  private normalizeResourceName(resourceName: string | undefined): string | null {
    if (typeof resourceName !== 'string') {
      return null;
    }

    const normalized = resourceName.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private finalizeRecommendedNameForTab(tab: ContactsWorkbookTab, recommendedNameRaw: string): string {
    const recommendedName = recommendedNameRaw.trim();
    if (!recommendedName) {
      return '';
    }

    if (!isContactsWithConversationsLikeTab(tab)) {
      return recommendedName;
    }

    if (recommendedName.toLowerCase().endsWith(' llamada')) {
      return recommendedName;
    }

    return `${recommendedName} llamada`;
  }

  private ensureUniqueRecommendedName(contactId: string, candidateRawName: string): string {
    const candidateName = candidateRawName.trim();
    if (!candidateName) {
      return '';
    }

    const usedNameKeys = this.collectUsedNameKeys(contactId);
    const baseNameKey = this.toNameKey(candidateName);
    if (!baseNameKey) {
      return '';
    }

    const maxUsedSuffixIndex = this.findMaxUsedSuffixIndex(baseNameKey, usedNameKeys);
    const hasUsedSuffixes = maxUsedSuffixIndex !== null;
    const isBaseNameUsed = usedNameKeys.has(baseNameKey);

    if (!isBaseNameUsed && !hasUsedSuffixes) {
      return candidateName;
    }

    let suffixIndex = isBaseNameUsed ? 1 : (maxUsedSuffixIndex as number) + 1;
    while (suffixIndex < 10_000) {
      const suffix = this.buildAlphabeticalSuffix(suffixIndex);
      const nextCandidate = `${candidateName} ${suffix}`;
      const nextKey = this.toNameKey(nextCandidate);
      if (nextKey && !usedNameKeys.has(nextKey)) {
        return nextCandidate;
      }

      suffixIndex += 1;
    }

    return candidateName;
  }

  private collectUsedNameKeys(excludedContactId: string): Set<string> {
    const usedNameKeys = new Set<string>();
    const contacts = this.contactsDirectoryStore.contacts();

    for (const contact of contacts) {
      this.addBackendContactNameKeys(usedNameKeys, contact);
    }

    const suggestedNames = this.recommendedNameByContactIdState();
    for (const [contactId, suggestedName] of Object.entries(suggestedNames)) {
      if (contactId === excludedContactId) {
        continue;
      }

      const suggestedNameKey = this.toNameKey(suggestedName);
      if (!suggestedNameKey) {
        continue;
      }

      usedNameKeys.add(suggestedNameKey);
    }

    return usedNameKeys;
  }

  private addBackendContactNameKeys(usedNameKeys: Set<string>, contact: BackendContact): void {
    for (const name of contact.names) {
      const nameKey = this.toNameKey(name);
      if (!nameKey) {
        continue;
      }

      usedNameKeys.add(nameKey);
    }
  }

  private toNameKey(rawName: string | null | undefined): string | null {
    if (typeof rawName !== 'string') {
      return null;
    }

    const normalized = rawName.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private buildAlphabeticalSuffix(suffixAttempt: number): string {
    let value = suffixAttempt + 1;
    let suffix = '';

    while (value > 0) {
      value -= 1;
      suffix = String.fromCharCode(65 + (value % 26)) + suffix;
      value = Math.floor(value / 26);
    }

    return suffix;
  }

  private findMaxUsedSuffixIndex(baseNameKey: string, usedNameKeys: Set<string>): number | null {
    let maxSuffixIndex: number | null = null;
    const expectedPrefix = `${baseNameKey} `;

    for (const usedNameKey of usedNameKeys) {
      if (!usedNameKey.startsWith(expectedPrefix)) {
        continue;
      }

      const suffixRaw = usedNameKey.slice(expectedPrefix.length).trim();
      if (!/^[a-z]+$/.test(suffixRaw)) {
        continue;
      }

      const suffixIndex = this.parseAlphabeticalSuffixIndex(suffixRaw);
      if (suffixIndex === null) {
        continue;
      }

      if (maxSuffixIndex === null || suffixIndex > maxSuffixIndex) {
        maxSuffixIndex = suffixIndex;
      }
    }

    return maxSuffixIndex;
  }

  private parseAlphabeticalSuffixIndex(suffixRaw: string): number | null {
    if (!suffixRaw) {
      return null;
    }

    let numericValue = 0;
    for (const character of suffixRaw.toUpperCase()) {
      const code = character.charCodeAt(0);
      if (code < 65 || code > 90) {
        return null;
      }

      numericValue = numericValue * 26 + (code - 64);
    }

    return numericValue - 1;
  }
}

function isContactsWithConversationsLikeTab(tab: ContactsWorkbookTab): boolean {
  return tab === 'contactsWithConversations' || tab === 'prospectsWithConversations';
}
