import type { ChatMessageDirection } from './conversation-view.types';
import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';

export function mapDirectionFromAgentPerspective(rawDirection: string): ChatMessageDirection {
  const normalizedDirection = rawDirection.trim().toLowerCase();

  if (normalizedDirection === 'agent_to_customer') {
    return 'outgoing';
  }

  if (
    normalizedDirection === 'whatsapp' ||
    normalizedDirection === 'whatsapauto' ||
    normalizedDirection === 'whatsappauto' ||
    normalizedDirection.startsWith('whatsapp_')
  ) {
    return 'system';
  }

  return 'incoming';
}

export function formatSentAt(rawSentAt: string): string {
  const sentAtDate = new Date(rawSentAt);

  if (Number.isNaN(sentAtDate.getTime())) {
    return rawSentAt;
  }

  return sentAtDate.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function buildRawSentAtMap(document: BackendConversationDocument): Map<string, string> {
  const sentAtByMessageId = new Map<string, string>();

  (document.rawMessages ?? []).forEach((rawMessage) => {
    sentAtByMessageId.set(rawMessage.externalId, formatSentAt(rawMessage.sentAt));
  });

  return sentAtByMessageId;
}

export function resolveSentAtFromMessageIds(
  sentAtByMessageId: Map<string, string>,
  messageIds: string[]
): string {
  for (let index = messageIds.length - 1; index >= 0; index -= 1) {
    const sentAt = sentAtByMessageId.get(messageIds[index]);

    if (sentAt) {
      return sentAt;
    }
  }

  return 'Sin fecha';
}
