import { Injectable } from '@nestjs/common';
import {
  CleanedConversationMessage,
  MessageDirection,
  StructuredConversationTurn
} from './kwoledge-ingestion-message.model';

type StructuredSender = 'customer' | 'agent';
type MessageSenderRole = StructuredSender | 'system';

class PreparedMessage {
  constructor(
    public readonly externalId: string,
    public readonly conversationId: string,
    public readonly sourceFile: string,
    public readonly sentAt: Date | null,
    public readonly sender: StructuredSender,
    public readonly text: string
  ) {}
}

class MessageGroup {
  constructor(
    public readonly sender: StructuredSender,
    public readonly messages: PreparedMessage[]
  ) {}
}

const NOISE_MESSAGE_PATTERNS: RegExp[] = [
  /las llamadas y los mensajes enviados a este chat ahora estan seguros con cifrado de extremo a extremo/i,
  /messages and calls are end-to-end encrypted/i,
  /es un contacto\./i,
  /is a contact\./i,
  /este mensaje fue eliminado/i,
  /this message was deleted/i,
  /llamada de voz perdida/i,
  /missed voice call/i,
  /desactivo los mensajes que desaparecen/i,
  /disabled disappearing messages/i,
  /activo la desaparicion de mensajes/i,
  /turned on disappearing messages/i
];

const VERY_SHORT_NON_INFORMATIVE_TEXTS = new Set<string>([
  '',
  '.',
  '..',
  '...',
  '+',
  '-',
  '?',
  '¿',
  'ok',
  'ok.',
  'oki',
  'oka',
  'vale',
  'vale.',
  'va',
  'listo',
  'listo.',
  'perfecto',
  'perfecto.',
  'gracias',
  'gracias.',
  'sii',
  'si',
  'sí',
  'mmm',
  'mm',
  'aja',
  'ajá'
]);

const EMOJI_TO_SPANISH_TAG: ReadonlyArray<readonly [string, string]> = [
  ['❤️', '[amor]'],
  ['❤', '[amor]'],
  ['🙂', '[emoción positiva]'],
  ['😊', '[emoción positiva]'],
  ['☺️', '[emoción positiva]'],
  ['👍', '[ok]'],
  ['👌', '[ok]'],
  ['😂', '[risa]'],
  ['🤣', '[risa]'],
  ['😍', '[entusiasmo]'],
  ['🥰', '[entusiasmo]'],
  ['😅', '[nervios]'],
  ['🙏', '[agradecimiento]'],
  ['✨', '[destacado]'],
  ['📸', '[foto]'],
  ['💌', '[mensaje]'],
  ['💡', '[idea]'],
  ['🎁', '[regalo]'],
  ['💰', '[precio]'],
  ['💳', '[pago]'],
  ['⚠️', '[importante]'],
  ['⚠', '[importante]'],
  ['🖼', '[cuadro]']
];

@Injectable()
export class ConversationStructuringService {
  public buildTurns(cleanedMessages: CleanedConversationMessage[]): StructuredConversationTurn[] {
    const groupedByConversation = this.groupByConversationAndSource(cleanedMessages);
    const turns: StructuredConversationTurn[] = [];

    groupedByConversation.forEach((conversationMessages, conversationKey) => {
      const conversationTurns = this.buildConversationTurns(conversationKey, conversationMessages);
      turns.push(...conversationTurns);
    });

    return turns;
  }

  public normalizeEmojis(text: string): string {
    let normalized = text;

    for (const [emoji, tag] of EMOJI_TO_SPANISH_TAG) {
      normalized = normalized.split(emoji).join(` ${tag} `);
    }

    return this.normalizeWhitespaces(normalized);
  }

  private buildConversationTurns(
    conversationKey: string,
    conversationMessages: CleanedConversationMessage[]
  ): StructuredConversationTurn[] {
    const preparedMessages = this.prepareMessages(conversationMessages);
    const groupedBySender = this.groupConsecutiveBySender(preparedMessages);
    const turns: StructuredConversationTurn[] = [];
    let nextTurnIndex = 1;

    for (let index = 0; index < groupedBySender.length; index += 1) {
      const questionGroup = groupedBySender[index];

      if (!questionGroup || questionGroup.sender !== 'customer') {
        continue;
      }

      const answerGroup = groupedBySender[index + 1];

      if (!answerGroup || answerGroup.sender !== 'agent') {
        continue;
      }

      const candidateQuestion = this.joinGroupTexts(questionGroup.messages);
      const candidateAnswer = this.joinGroupTexts(answerGroup.messages);

      if (!candidateQuestion || !candidateAnswer) {
        continue;
      }

      const candidateTurn = new StructuredConversationTurn(
        `${conversationKey}-turn-${nextTurnIndex}`,
        questionGroup.messages[0]?.conversationId ?? 'unknown-conversation',
        questionGroup.messages[0]?.sourceFile ?? 'unknown-source',
        candidateQuestion,
        candidateAnswer,
        questionGroup.messages[0]?.sentAt ?? null,
        answerGroup.messages[answerGroup.messages.length - 1]?.sentAt ??
          questionGroup.messages[questionGroup.messages.length - 1]?.sentAt ??
          null,
        [
          ...questionGroup.messages.map((message) => message.externalId),
          ...answerGroup.messages.map((message) => message.externalId)
        ]
      );

      if (this.isWeakTurn(candidateTurn)) {
        this.mergeWithPreviousTurn(turns, candidateTurn);
        continue;
      }

      turns.push(candidateTurn);
      nextTurnIndex += 1;
      index += 1;
    }

    return turns;
  }

  private prepareMessages(conversationMessages: CleanedConversationMessage[]): PreparedMessage[] {
    return this.sortConversationMessages(conversationMessages)
      .map((message) => this.prepareMessage(message))
      .filter((message): message is PreparedMessage => message !== null);
  }

  private prepareMessage(message: CleanedConversationMessage): PreparedMessage | null {
    const senderRole = this.resolveSenderRole(message);

    if (senderRole === 'system') {
      return null;
    }

    const normalizedText = this.normalizeText(message.cleanedText);
    const normalizedTextForNoiseFilter = this.normalizeForComparisons(normalizedText);
    const hasAttachment =
      !!message.normalizedFields.attachment ||
      !!message.normalizedFields.attachmentType ||
      !!message.normalizedFields.attachmentInfo;

    if (this.isNoiseMessage(normalizedTextForNoiseFilter, hasAttachment)) {
      return null;
    }

    return new PreparedMessage(
      message.externalId,
      message.conversationId,
      message.sourceFile,
      message.sentAt,
      senderRole,
      normalizedText
    );
  }

  private resolveSenderRole(message: CleanedConversationMessage): MessageSenderRole {
    const normalizedType = this.normalizeForComparisons(message.normalizedFields.messageType ?? '');

    if (normalizedType.includes('notificacion') || normalizedType.includes('notification')) {
      return 'system';
    }

    if (message.direction === MessageDirection.Incoming) {
      return 'customer';
    }

    if (message.direction === MessageDirection.Outgoing) {
      return 'agent';
    }

    return 'system';
  }

  private normalizeText(text: string): string {
    const withoutReplyHeader = text.replace(/^↩\s*Respuesta para[^\n\r]*$/gim, ' ');
    const withNormalizedEmojis = this.normalizeEmojis(withoutReplyHeader);
    return this.normalizeWhitespaces(withNormalizedEmojis);
  }

  private normalizeWhitespaces(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private isNoiseMessage(normalizedText: string, hasAttachment: boolean): boolean {
    if (!normalizedText) {
      return true;
    }

    if (NOISE_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
      return true;
    }

    const isMediaPlaceholder =
      normalizedText === 'imagen' ||
      normalizedText === '(imagen)' ||
      normalizedText === 'image omitted' ||
      normalizedText === '<media omitted>' ||
      normalizedText === 'audio omitted' ||
      normalizedText === 'video omitted';

    if (isMediaPlaceholder) {
      return true;
    }

    return hasAttachment && VERY_SHORT_NON_INFORMATIVE_TEXTS.has(normalizedText);
  }

  private normalizeForComparisons(text: string): string {
    return this.normalizeWhitespaces(
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    );
  }

  private groupConsecutiveBySender(messages: PreparedMessage[]): MessageGroup[] {
    const groups: MessageGroup[] = [];

    for (const message of messages) {
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.sender !== message.sender) {
        groups.push(new MessageGroup(message.sender, [message]));
        continue;
      }

      lastGroup.messages.push(message);
    }

    return groups;
  }

  private joinGroupTexts(messages: PreparedMessage[]): string {
    return this.normalizeWhitespaces(messages.map((message) => message.text).join(' '));
  }

  private isWeakTurn(turn: StructuredConversationTurn): boolean {
    return (
      this.isLowInformationText(turn.question) ||
      this.isLowInformationText(turn.answer)
    );
  }

  private isLowInformationText(text: string): boolean {
    const normalized = this.normalizeForComparisons(text);

    if (VERY_SHORT_NON_INFORMATIVE_TEXTS.has(normalized)) {
      return true;
    }

    const onlyLettersSpacesAndTags = normalized.replace(/[a-z\s[\]]/g, '').length === 0;

    if (onlyLettersSpacesAndTags && normalized.length <= 6) {
      return true;
    }

    return false;
  }

  private mergeWithPreviousTurn(
    turns: StructuredConversationTurn[],
    candidateTurn: StructuredConversationTurn
  ): void {
    const previousTurn = turns[turns.length - 1];

    if (!previousTurn) {
      return;
    }

    const mergedTurn = new StructuredConversationTurn(
      previousTurn.turnId,
      previousTurn.conversationId,
      previousTurn.sourceFile,
      this.normalizeWhitespaces(`${previousTurn.question} ${candidateTurn.question}`),
      this.normalizeWhitespaces(`${previousTurn.answer} ${candidateTurn.answer}`),
      previousTurn.startedAt,
      candidateTurn.endedAt ?? previousTurn.endedAt,
      [...previousTurn.messageIds, ...candidateTurn.messageIds]
    );

    turns[turns.length - 1] = mergedTurn;
  }

  private groupByConversationAndSource(
    cleanedMessages: CleanedConversationMessage[]
  ): Map<string, CleanedConversationMessage[]> {
    const groupedMessages = new Map<string, CleanedConversationMessage[]>();

    for (const message of cleanedMessages) {
      const key = `${message.conversationId}|${message.sourceFile}`;
      const current = groupedMessages.get(key) ?? [];
      current.push(message);
      groupedMessages.set(key, current);
    }

    return groupedMessages;
  }

  private sortConversationMessages(
    cleanedMessages: CleanedConversationMessage[]
  ): CleanedConversationMessage[] {
    return [...cleanedMessages].sort((left, right) => {
      const leftTime = left.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.rowNumber - right.rowNumber;
    });
  }
}
