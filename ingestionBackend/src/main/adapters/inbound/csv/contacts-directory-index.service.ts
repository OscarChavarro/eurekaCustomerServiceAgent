import { Injectable } from '@nestjs/common';
import type { ContactDirectoryContact } from '../../../application/ports/outbound/contacts-directory.port';

@Injectable()
export class ContactsDirectoryIndexService {
  public buildNameToPhonesIndex(contacts: ContactDirectoryContact[]): Map<string, string[]> {
    return this.buildIndex(contacts, (name) => this.normalizeName(name));
  }

  public buildImazingUnicodeReplacementNameToPhonesIndex(
    contacts: ContactDirectoryContact[]
  ): Map<string, string[]> {
    return this.buildIndex(contacts, (name) =>
      this.normalizeNameWithImazingUnicodeReplacement(name)
    );
  }

  public resolvePreferredPhoneNumber(
    contactName: string,
    index: Map<string, string[]>
  ): string | null {
    return this.resolvePreferredPhoneNumberWith(
      contactName,
      index,
      (name) => this.normalizeName(name)
    );
  }

  public resolvePreferredPhoneNumberWithImazingUnicodeReplacement(
    contactName: string,
    index: Map<string, string[]>
  ): string | null {
    return this.resolvePreferredPhoneNumberWith(
      contactName,
      index,
      (name) => this.normalizeNameWithImazingUnicodeReplacement(name)
    );
  }

  private buildIndex(
    contacts: ContactDirectoryContact[],
    nameNormalizer: (name: string) => string
  ): Map<string, string[]> {
    const index = new Map<string, string[]>();

    for (const contact of contacts) {
      const uniquePhoneNumbers = this.getUniquePhoneNumbers(contact.phoneNumbers);
      if (uniquePhoneNumbers.length === 0) {
        continue;
      }

      for (const name of contact.names) {
        const normalizedName = nameNormalizer(name);
        if (!normalizedName) {
          continue;
        }

        const existing = index.get(normalizedName) ?? [];
        const merged = this.getUniquePhoneNumbers([...existing, ...uniquePhoneNumbers]);
        index.set(normalizedName, merged);
      }
    }

    return index;
  }

  private resolvePreferredPhoneNumberWith(
    contactName: string,
    index: Map<string, string[]>,
    nameNormalizer: (name: string) => string
  ): string | null {
    const normalizedName = nameNormalizer(contactName);
    if (!normalizedName) {
      return null;
    }

    const candidates = index.get(normalizedName) ?? [];
    if (candidates.length === 0) {
      return null;
    }

    return [...candidates].sort((left, right) => this.compareCandidates(left, right))[0] ?? null;
  }

  private compareCandidates(left: string, right: string): number {
    const leftScore = this.buildPhoneScore(left);
    const rightScore = this.buildPhoneScore(right);

    if (leftScore.hasAreaCode !== rightScore.hasAreaCode) {
      return leftScore.hasAreaCode ? -1 : 1;
    }

    if (leftScore.digitsLength !== rightScore.digitsLength) {
      return rightScore.digitsLength - leftScore.digitsLength;
    }

    return left.localeCompare(right);
  }

  private buildPhoneScore(phoneNumber: string): {
    hasAreaCode: boolean;
    digitsLength: number;
  } {
    const digits = phoneNumber.replace(/\D/g, '');
    const hasAreaCodeByParentheses = /\(\s*\d{2,4}\s*\)/.test(phoneNumber);
    const hasAreaCodeByLength = digits.length >= 10;

    return {
      hasAreaCode: hasAreaCodeByParentheses || hasAreaCodeByLength,
      digitsLength: digits.length
    };
  }

  private getUniquePhoneNumbers(phoneNumbers: string[]): string[] {
    return Array.from(
      new Set(
        phoneNumbers
          .map((phoneNumber) => phoneNumber.trim())
          .filter((phoneNumber) => phoneNumber.length > 0)
      )
    );
  }

  private normalizeName(name: string): string {
    return name
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private normalizeNameWithImazingUnicodeReplacement(name: string): string {
    return this.normalizeName(name)
      .replace(/[^a-z0-9 @.+\-_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
