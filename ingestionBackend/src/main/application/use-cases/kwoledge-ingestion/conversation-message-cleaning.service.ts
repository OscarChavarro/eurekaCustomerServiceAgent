import { Injectable, Logger } from '@nestjs/common';
import {
  CleanedConversationMessage,
  RawConversationMessage
} from './kwoledge-ingestion-message.model';

@Injectable()
export class ConversationMessageCleaningService {
  private readonly logger = new Logger(ConversationMessageCleaningService.name);

  public clean(rawMessages: RawConversationMessage[]): CleanedConversationMessage[] {
    this.logger.log('PENDING TO PROCESS');

    return rawMessages.map((rawMessage) => {
      const cleanedText = this.cleanText(rawMessage.text);

      return new CleanedConversationMessage(
        rawMessage.conversationId,
        rawMessage.externalId,
        rawMessage.sentAt,
        rawMessage.sender,
        cleanedText,
        rawMessage.sourceFile,
        rawMessage.rowNumber,
        rawMessage.direction,
        rawMessage.normalizedFields
      );
    });
  }

  private cleanText(text: string): string {
    const withoutEmoji = text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '');
    const withoutArtifacts = withoutEmoji
      .replace(/<media omitted>/gi, ' ')
      .replace(/\[(image|video|audio|document) omitted\]/gi, ' ')
      .replace(/\u200e|\u200f|\u2060/g, ' ');

    return withoutArtifacts.replace(/\s+/g, ' ').trim();
  }
}
