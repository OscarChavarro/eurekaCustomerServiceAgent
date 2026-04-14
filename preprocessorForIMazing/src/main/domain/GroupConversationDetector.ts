import { CsvRecord } from './Conversation';
import { NameNormalizer } from './NameNormalizer';

export class GroupConversationDetector {
  constructor(private readonly nameNormalizer: NameNormalizer) {}

  isGroupConversation(records: CsvRecord[], conversationName: string): boolean {
    const normalizedConversationName = this.nameNormalizer.normalizeForMatch(conversationName);
    const values: string[] = this.collectRecordValues(records);

    for (const value of values) {
      if (this.isCreatedThisCommunityMessage(value)) {
        return true;
      }

      const extractedGroupName = this.extractGroupNameFromCreatedCommunityMessage(value);
      const extractedSubjectName = this.extractGroupNameFromSubjectChangeMessage(value);
      const resolvedGroupName = extractedGroupName ?? extractedSubjectName;
      if (resolvedGroupName === null) {
        continue;
      }

      if (this.isMatchingGroupName(resolvedGroupName, conversationName, normalizedConversationName)) {
        return true;
      }
    }

    return false;
  }

  private collectRecordValues(records: CsvRecord[]): string[] {
    const values: string[] = [];

    for (const record of records) {
      const keys = Object.keys(record);
      for (const key of keys) {
        const value = record[key];
        if (value.trim().length > 0) {
          values.push(value);
        }
      }
    }

    return values;
  }

  private isCreatedThisCommunityMessage(value: string): boolean {
    return /created this community/i.test(value);
  }

  private extractGroupNameFromCreatedCommunityMessage(value: string): string | null {
    const singleQuotedMatch = /created community\s+'([^']+)'/i.exec(value);
    if (singleQuotedMatch !== null) {
      return singleQuotedMatch[1];
    }

    const doubleQuotedMatch = /created community\s+"([^"]+)"/i.exec(value);
    if (doubleQuotedMatch !== null) {
      return doubleQuotedMatch[1];
    }

    return null;
  }

  private extractGroupNameFromSubjectChangeMessage(value: string): string | null {
    const singleQuotedMatch = /changed the subject to\s+'([^']+)'/i.exec(value);
    if (singleQuotedMatch !== null) {
      return singleQuotedMatch[1];
    }

    const doubleQuotedMatch = /changed the subject to\s+"([^"]+)"/i.exec(value);
    if (doubleQuotedMatch !== null) {
      return doubleQuotedMatch[1];
    }

    return null;
  }

  private isMatchingGroupName(groupName: string, conversationName: string, normalizedConversationName: string): boolean {
    const normalizedGroupName = this.nameNormalizer.normalizeForMatch(groupName);
    if (normalizedGroupName === normalizedConversationName) {
      return true;
    }

    // iMazing can replace emojis with "_" in filenames. Compare an alphanumeric-only
    // canonical form to keep those names equivalent.
    const groupCanonical = this.toAlphaNumericCanonical(groupName);
    const conversationCanonical = this.toAlphaNumericCanonical(conversationName);
    return groupCanonical.length > 0 && groupCanonical === conversationCanonical;
  }

  private toAlphaNumericCanonical(value: string): string {
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return normalized.replace(/[^a-z0-9]+/g, '');
  }
}
