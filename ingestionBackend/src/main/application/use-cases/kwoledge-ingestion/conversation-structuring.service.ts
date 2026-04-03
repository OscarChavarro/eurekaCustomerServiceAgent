import { Injectable } from '@nestjs/common';
import {
  CleanedConversationMessage,
  MessageDirection,
  StructuredConversationTurn
} from './kwoledge-ingestion-message.model';

@Injectable()
export class ConversationStructuringService {
  public buildTurns(cleanedMessages: CleanedConversationMessage[]): StructuredConversationTurn[] {
    const groupedByConversation = this.groupByConversation(cleanedMessages);
    const turns: StructuredConversationTurn[] = [];

    groupedByConversation.forEach((conversationMessages) => {
      const sortedMessages = this.sortConversationMessages(conversationMessages);
      let pendingCustomerMessages: CleanedConversationMessage[] = [];
      let turnCounter = 0;

      for (const message of sortedMessages) {
        const isCustomerMessage =
          message.direction === MessageDirection.Incoming ||
          message.direction === MessageDirection.Unknown;

        if (isCustomerMessage) {
          pendingCustomerMessages.push(message);
          continue;
        }

        turnCounter += 1;
        turns.push(this.buildTurn(pendingCustomerMessages, message, turnCounter));
        pendingCustomerMessages = [];
      }

      if (pendingCustomerMessages.length > 0) {
        turnCounter += 1;
        turns.push(this.buildTurn(pendingCustomerMessages, null, turnCounter));
      }
    });

    return turns;
  }

  private groupByConversation(
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

  private buildTurn(
    customerMessages: CleanedConversationMessage[],
    agentMessage: CleanedConversationMessage | null,
    turnCounter: number
  ): StructuredConversationTurn {
    const customerText = customerMessages.map((message) => message.cleanedText).join('\n').trim();
    const agentText = agentMessage?.cleanedText?.trim() ?? '';

    const firstCustomer = customerMessages[0] ?? null;
    const lastCustomer = customerMessages[customerMessages.length - 1] ?? null;
    const startedAt = firstCustomer?.sentAt ?? agentMessage?.sentAt ?? null;
    const endedAt = agentMessage?.sentAt ?? lastCustomer?.sentAt ?? startedAt;

    const conversationId =
      firstCustomer?.conversationId ?? agentMessage?.conversationId ?? 'unknown-conversation';
    const sourceFile = firstCustomer?.sourceFile ?? agentMessage?.sourceFile ?? 'unknown-source';

    const messageIds = [
      ...customerMessages.map((message) => message.externalId),
      ...(agentMessage ? [agentMessage.externalId] : [])
    ];

    return new StructuredConversationTurn(
      `${conversationId}-turn-${turnCounter}`,
      conversationId,
      sourceFile,
      customerText,
      agentText,
      startedAt,
      endedAt,
      messageIds
    );
  }
}
