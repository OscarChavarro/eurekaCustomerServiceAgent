import type { ChatMessageDirection } from './conversation-view.types';
import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { SupportedLanguage } from '../../../core/i18n/types/supported-language.type';

const MONTH_SHORT_BY_LANGUAGE: Record<SupportedLanguage, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
};

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

export function formatSentAt(rawSentAt: string, language: SupportedLanguage = 'es'): string {
  const sentAtDate = parseDateValue(rawSentAt);

  if (Number.isNaN(sentAtDate.getTime())) {
    return rawSentAt;
  }

  return formatDateParts(sentAtDate, language);
}

export function formatDateLabel(rawDate: string | null | undefined, language: SupportedLanguage): string {
  if (!rawDate) {
    return formatDateParts(new Date(), language);
  }

  return formatSentAt(rawDate, language);
}

export function buildRawSentAtMap(
  document: BackendConversationDocument,
  language: SupportedLanguage = 'es'
): Map<string, string> {
  const sentAtByMessageId = new Map<string, string>();

  (document.rawMessages ?? []).forEach((rawMessage) => {
    sentAtByMessageId.set(rawMessage.externalId, formatDateLabel(rawMessage.sentAt, language));
  });

  return sentAtByMessageId;
}

export function resolveSentAtFromMessageIds(
  sentAtByMessageId: Map<string, string>,
  messageIds: string[],
  language: SupportedLanguage = 'es'
): string {
  for (let index = messageIds.length - 1; index >= 0; index -= 1) {
    const sentAt = sentAtByMessageId.get(messageIds[index]);

    if (sentAt) {
      return sentAt;
    }
  }

  return formatDateParts(new Date(), language);
}

function parseDateValue(rawDate: string): Date {
  const normalizedDate = rawDate.includes(' ') && !rawDate.includes('T')
    ? rawDate.replace(' ', 'T')
    : rawDate;

  return new Date(normalizedDate);
}

function formatDateParts(date: Date, language: SupportedLanguage): string {
  const year = date.getFullYear();
  const month = MONTH_SHORT_BY_LANGUAGE[language][date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
