import { Injectable } from '@nestjs/common';
import {
  CleanedConversationMessage,
  RawConversationMessage
} from './kwoledge-ingestion-message.model';

@Injectable()
export class ConversationMessageCleaningService {
  public clean(rawMessages: RawConversationMessage[]): CleanedConversationMessage[] {
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
    const withoutArtifacts = text
      .replace(/<media omitted>/gi, ' ')
      .replace(/\[(image|video|audio|document) omitted\]/gi, ' ')
      .replace(/\u200e|\u200f|\u2060/g, ' ');

    return withoutArtifacts.replace(/\s+/g, ' ').trim();
  }
}
