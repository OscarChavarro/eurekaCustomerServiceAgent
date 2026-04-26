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
    const normalizedConversationNames = this.buildConversationNameCandidates(command.conversationName);
    const candidatePhones = new Set<string>();

    for (const normalizedConversationName of normalizedConversationNames) {
      const exactCandidates = contactsByNormalizedName.get(normalizedConversationName) ?? [];
      for (const phoneNumber of exactCandidates) {
        candidatePhones.add(phoneNumber);
      }
    }

    if (candidatePhones.size === 0) {
      for (const normalizedConversationName of normalizedConversationNames) {
        this.collectPartialMatchPhones(normalizedConversationName, contactsByNormalizedName, candidatePhones);
      }
    }

    const sortedCandidates = Array.from(candidatePhones).sort((left, right) => left.localeCompare(right));
    if (sortedCandidates.length === 0) {
      return null;
    }

    if (sortedCandidates.length > 1) {
      this.logger.warn(
        `Multiple contact phones matched for "${command.conversationName}". Using deterministic first match: ${sortedCandidates[0]}.`
      );
    }

    return sortedCandidates[0];
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

  private buildConversationNameCandidates(conversationName: string): string[] {
    const rawCandidates = new Set<string>();
    const trimmedName = conversationName.trim();
    rawCandidates.add(trimmedName);
    rawCandidates.add(trimmedName.replace(/\s+\d+(?:\s+\d+)*\s*$/g, '').trim());
    rawCandidates.add(trimmedName.replace(/^\s*\d+(?:\s+\d+)*\s+/g, '').trim());

    const normalizedCandidates = new Set<string>();
    rawCandidates.forEach((candidate) => {
      if (candidate.length === 0) {
        return;
      }

      const normalized = this.nameNormalizer.normalizeForMatch(candidate);
      if (normalized.length > 0) {
        normalizedCandidates.add(normalized);
      }
    });

    return Array.from(normalizedCandidates);
  }

  private collectPartialMatchPhones(
    normalizedConversationName: string,
    contactsByNormalizedName: Map<string, string[]>,
    candidatePhones: Set<string>
  ): void {
    contactsByNormalizedName.forEach((phones, normalizedContactName) => {
      if (!this.isPartialNameMatch(normalizedConversationName, normalizedContactName)) {
        return;
      }

      for (const phoneNumber of phones) {
        candidatePhones.add(phoneNumber);
      }
    });
  }

  private isPartialNameMatch(normalizedConversationName: string, normalizedContactName: string): boolean {
    const shortestLength = Math.min(normalizedConversationName.length, normalizedContactName.length);
    const minTokenCount = Math.min(this.countTokens(normalizedConversationName), this.countTokens(normalizedContactName));

    if (shortestLength < 6 && minTokenCount < 2) {
      return false;
    }

    return (
      normalizedConversationName.includes(normalizedContactName) ||
      normalizedContactName.includes(normalizedConversationName)
    );
  }

  private countTokens(value: string): number {
    return value.split('_').filter((token) => token.length > 0).length;
  }
}
