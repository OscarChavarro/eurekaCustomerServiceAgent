import { Inject, Injectable } from '@nestjs/common';
import type {
  ConversationsRepositoryPort,
  RawConversationAudioMessage
} from '../../ports/outbound/conversations-repository.port';
import { TOKENS } from '../../ports/tokens';
import { FixFilePatternResult } from './fix-file-pattern.result';

type ConversationPatternCandidate = {
  conversationId: string;
  conversationContactName: string | null;
  conversationFilePattern: string | null;
};

@Injectable()
export class FixFilePatternUseCase {
  private static readonly WHATSAPP_PREFIX = /^whatsapp\s*-\s*/i;

  constructor(
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort
  ) {}

  public async execute(rawAudioMessages: RawConversationAudioMessage[]): Promise<FixFilePatternResult> {
    const conversationCandidates = this.collectConversationCandidates(rawAudioMessages);
    const resolvedFilePatternByConversationId = new Map<string, string | null>();
    let updatedConversations = 0;

    for (const candidate of conversationCandidates.values()) {
      const resolvedFilePattern = this.resolveFilePatternFromContact(
        candidate.conversationContactName,
        candidate.conversationFilePattern
      );
      resolvedFilePatternByConversationId.set(candidate.conversationId, resolvedFilePattern);

      if (!resolvedFilePattern || resolvedFilePattern === candidate.conversationFilePattern) {
        continue;
      }

      await this.conversationsRepositoryPort.updateConversationFilePattern(
        candidate.conversationId,
        resolvedFilePattern
      );
      updatedConversations += 1;
    }

    return new FixFilePatternResult(
      resolvedFilePatternByConversationId,
      conversationCandidates.size,
      updatedConversations
    );
  }

  private collectConversationCandidates(
    rawAudioMessages: RawConversationAudioMessage[]
  ): Map<string, ConversationPatternCandidate> {
    const byConversationId = new Map<string, ConversationPatternCandidate>();

    for (const rawAudioMessage of rawAudioMessages) {
      const existing = byConversationId.get(rawAudioMessage.conversationId);
      if (existing) {
        continue;
      }

      byConversationId.set(rawAudioMessage.conversationId, {
        conversationId: rawAudioMessage.conversationId,
        conversationContactName: rawAudioMessage.conversationContactName,
        conversationFilePattern: rawAudioMessage.conversationFilePattern
      });
    }

    return byConversationId;
  }

  private resolveFilePatternFromContact(
    contactName: string | null,
    currentFilePattern: string | null
  ): string | null {
    const normalizedContactLabel = this.normalizeContactLabel(contactName);

    if (!normalizedContactLabel) {
      return currentFilePattern;
    }

    const emojiNormalizedLabel = this.replaceEmojiGraphemesWithUnderscore(normalizedContactLabel)
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .trim();

    if (!emojiNormalizedLabel) {
      return currentFilePattern;
    }

    return emojiNormalizedLabel;
  }

  private normalizeContactLabel(contactName: string | null): string | null {
    if (!contactName) {
      return null;
    }

    const trimmed = contactName.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.replace(FixFilePatternUseCase.WHATSAPP_PREFIX, '').trim();
  }

  private replaceEmojiGraphemesWithUnderscore(value: string): string {
    const graphemes = this.segmentIntoGraphemes(value);
    return graphemes
      .map((grapheme) => (this.isEmojiLikeGrapheme(grapheme) ? '_' : grapheme))
      .join('');
  }

  private segmentIntoGraphemes(value: string): string[] {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined') {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(value), (segment) => segment.segment);
    }

    return Array.from(value);
  }

  private isEmojiLikeGrapheme(value: string): boolean {
    const emojiLikeCharsPattern =
      /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u;

    return emojiLikeCharsPattern.test(value);
  }
}
