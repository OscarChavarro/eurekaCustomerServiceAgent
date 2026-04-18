import { ContactEntry } from 'src/ports/outbound/contacts-backend.port';

export type MessageReceiveMode = 'WHATSAPP_ID' | 'JSON' | 'SILENT';

export type ProcessIncomingWhatsappMessageContext = {
  agentPhoneNumber: string;
  senderPhoneNumber: string;
  conversationJid: string | null;
  incomingTexts: string[];
  contacts: ContactEntry[];
  messageReceiveMode: MessageReceiveMode;
  rawPayload?: unknown;
};
