import { Injectable } from '@nestjs/common';
import { basename } from 'node:path';
import type { ConversationCsvRawRecord } from '../../ports/inbound/conversation-csv-source.port';
import {
  KwoledgeIngestionMessage,
  MessageDirection,
  NormalizedConversationCsvFields
} from './kwoledge-ingestion-message.model';

type TranslatableField = keyof NormalizedConversationCsvFields;

const FIELD_TRANSLATION_TABLE: Record<string, TranslatableField> = {
  chatsession: 'chatSession',
  sesiondechat: 'chatSession',
  messagechat: 'chatSession',

  messagedate: 'messageDate',
  fechadelmensaje: 'messageDate',

  sentdate: 'sentDate',
  fechadeenvio: 'sentDate',

  messagetype: 'messageType',
  tipo: 'messageType',

  senderid: 'senderId',
  iddelremitente: 'senderId',

  sendername: 'senderName',
  nombredelremitente: 'senderName',

  status: 'status',
  estado: 'status',

  forwarded: 'forwarded',
  reenviado: 'forwarded',

  replyto: 'replyTo',
  respuestapara: 'replyTo',

  text: 'text',
  texto: 'text',
  message: 'text',

  reactions: 'reactions',
  reacciones: 'reactions',

  attachment: 'attachment',
  adjunto: 'attachment',

  attachmenttype: 'attachmentType',
  tipodeadjunto: 'attachmentType',

  attachmentinfo: 'attachmentInfo',
  informaciondeladjunto: 'attachmentInfo'
};

@Injectable()
export class ConversationCsvRecordTranslatorService {
  public translate(record: ConversationCsvRawRecord): KwoledgeIngestionMessage {
    const normalizedFields = this.normalizeFields(record.fields);
    const fallbackConversationId = basename(record.sourceFile, '.csv');
    const conversationId = normalizedFields.chatSession ?? fallbackConversationId;
    const text = normalizedFields.text ?? '';

    return new KwoledgeIngestionMessage(
      conversationId,
      this.buildExternalId(conversationId, record.rowNumber),
      this.parseDate(normalizedFields.sentDate ?? normalizedFields.messageDate),
      normalizedFields.senderName ?? normalizedFields.senderId,
      text,
      record.sourceFile,
      record.rowNumber,
      this.normalizeDirection(normalizedFields.messageType),
      normalizedFields
    );
  }

  public buildLogPayload(message: KwoledgeIngestionMessage): Record<string, unknown> {
    return {
      sourceFile: message.sourceFile,
      rowNumber: message.rowNumber,
      fields: message.normalizedFields
    };
  }

  private normalizeFields(rawFields: Record<string, string>): NormalizedConversationCsvFields {
    const translated: Record<TranslatableField, string | null> = {
      chatSession: null,
      messageDate: null,
      sentDate: null,
      messageType: null,
      senderId: null,
      senderName: null,
      status: null,
      forwarded: null,
      replyTo: null,
      text: null,
      reactions: null,
      attachment: null,
      attachmentType: null,
      attachmentInfo: null
    };

    Object.entries(rawFields).forEach(([fieldName, rawValue]) => {
      const normalizedFieldName = this.normalizeKey(fieldName);
      const translatedFieldName = FIELD_TRANSLATION_TABLE[normalizedFieldName];

      if (!translatedFieldName) {
        return;
      }

      translated[translatedFieldName] = this.toNullableString(rawValue);
    });

    return new NormalizedConversationCsvFields(
      translated.chatSession,
      translated.messageDate,
      translated.sentDate,
      translated.messageType,
      translated.senderId,
      translated.senderName,
      translated.status,
      translated.forwarded,
      translated.replyTo,
      translated.text,
      translated.reactions,
      translated.attachment,
      translated.attachmentType,
      translated.attachmentInfo
    );
  }

  private normalizeDirection(rawType: string | null): MessageDirection {
    if (!rawType) {
      return MessageDirection.Unknown;
    }

    const normalized = this.normalizeKey(rawType);

    if (['saliente', 'outgoing', 'sent'].includes(normalized)) {
      return MessageDirection.Outgoing;
    }

    if (['entrante', 'incoming', 'received'].includes(normalized)) {
      return MessageDirection.Incoming;
    }

    return MessageDirection.Unknown;
  }

  private parseDate(rawValue: string | null): Date | null {
    if (!rawValue) {
      return null;
    }

    const parsedDate = new Date(rawValue);

    if (Number.isNaN(parsedDate.valueOf())) {
      return null;
    }

    return parsedDate;
  }

  private buildExternalId(conversationId: string, rowNumber: number): string {
    return `${conversationId}-${rowNumber}`;
  }

  private toNullableString(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
