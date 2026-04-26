import { NameNormalizer } from './NameNormalizer';

export class DisabledConversationMatcher {
  constructor(private readonly nameNormalizer: NameNormalizer) {}

  isDisabledConversation(conversationName: string, disabledPatterns: string[]): boolean {
    const normalizedConversationName = this.nameNormalizer.normalizeForMatch(conversationName);

    for (const pattern of disabledPatterns) {
      const normalizedPattern = this.nameNormalizer.normalizeForMatch(pattern);
      if (normalizedPattern.length === 0) {
        continue;
      }

      if (
        normalizedConversationName === normalizedPattern ||
        normalizedConversationName.includes(normalizedPattern) ||
        normalizedPattern.includes(normalizedConversationName)
      ) {
        return true;
      }
    }

    return false;
  }
}
