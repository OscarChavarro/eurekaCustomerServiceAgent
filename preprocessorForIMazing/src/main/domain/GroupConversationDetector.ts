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
      if (extractedGroupName === null) {
        continue;
      }

      const normalizedGroupName = this.nameNormalizer.normalizeForMatch(extractedGroupName);
      if (normalizedGroupName === normalizedConversationName) {
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
}
