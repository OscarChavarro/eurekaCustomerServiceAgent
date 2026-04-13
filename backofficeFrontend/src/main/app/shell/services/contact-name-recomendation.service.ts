import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ContactsApiService,
  type CreateContactResponse,
  type PatchContactResponse
} from '../../core/api/services/contacts-api.service';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId
} from '../../core/phone/phone-normalization.utils';
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

    await this.ensureRecommendedName(contact, firstMessageDate);
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
        await this.ensureRecommendedName(contact, firstMessageDate);
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
        await this.ensureRecommendedName(contact, firstMessageDate);
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
      const latestNames = this.recommendedNameByContactIdState();
      this.recommendedNameByContactIdState.set({
        ...latestNames,
        [contact.id]: recommendedName
      });
    } finally {
      const latestLoadingByContactId = this.recommendationLoadingByContactIdState();
      const { [contact.id]: _, ...nextLoadingByContactId } = latestLoadingByContactId;
      this.recommendationLoadingByContactIdState.set(nextLoadingByContactId);
    }
  }

  private resolvePhoneForContactCreate(contact: BlueActionContactRow): string | null {
    const firstPhone = contact.phoneNumbers.find((phone) => typeof phone === 'string' && phone.trim().length > 0);
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
}

function isContactsWithConversationsLikeTab(tab: ContactsWorkbookTab): boolean {
  return tab === 'contactsWithConversations' || tab === 'prospectsWithConversations';
}
