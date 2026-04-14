import { NameNormalizer } from '../../domain/NameNormalizer';
import { ContactEntry, ContactsBackendPort, LoggerPort } from '../ports';
import {
  ResolveConversationPhoneNumberCommand,
  ResolveConversationPhoneNumberStrategy
} from '../ResolveConversationPhoneNumberUseCase';

export class ResolvePhoneFromContactsBackendStrategy implements ResolveConversationPhoneNumberStrategy {
  private contactsByNormalizedName: Map<string, string[]> | null = null;

  constructor(
    private readonly contactsBackend: ContactsBackendPort,
    private readonly nameNormalizer: NameNormalizer,
    private readonly logger: LoggerPort
  ) {}

  async resolve(command: ResolveConversationPhoneNumberCommand): Promise<string | null> {
    const contactsByNormalizedName = await this.loadContactsByNormalizedName();
    const normalizedConversationName = this.nameNormalizer.normalizeForMatch(command.conversationName);
    const candidates = contactsByNormalizedName.get(normalizedConversationName);

    if (candidates === undefined || candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      this.logger.warn(`Skipping contacts fallback due to ambiguous phones for "${command.conversationName}".`);
      return null;
    }

    return candidates[0];
  }

  private async loadContactsByNormalizedName(): Promise<Map<string, string[]>> {
    if (this.contactsByNormalizedName !== null) {
      return this.contactsByNormalizedName;
    }

    const contacts: ContactEntry[] = await this.contactsBackend.listContacts();
    const byName = new Map<string, Set<string>>();

    for (const contact of contacts) {
      const normalizedPhones: string[] = contact.phoneNumbers
        .map((phoneNumber: string) => phoneNumber.replace(/\D/g, ''))
        .filter((phoneNumber: string) => phoneNumber.length > 0);

      if (normalizedPhones.length === 0) {
        continue;
      }

      for (const name of contact.names) {
        const normalizedName = this.nameNormalizer.normalizeForMatch(name);
        if (normalizedName.length === 0) {
          continue;
        }

        const existingPhones = byName.get(normalizedName) ?? new Set<string>();
        for (const phoneNumber of normalizedPhones) {
          existingPhones.add(phoneNumber);
        }
        byName.set(normalizedName, existingPhones);
      }
    }

    this.contactsByNormalizedName = new Map<string, string[]>();
    byName.forEach((phoneNumbers, normalizedName) => {
      this.contactsByNormalizedName!.set(normalizedName, Array.from(phoneNumbers));
    });

    return this.contactsByNormalizedName;
  }
}
