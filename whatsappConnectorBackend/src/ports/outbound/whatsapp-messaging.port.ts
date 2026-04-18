export interface WhatsappMessagingPort {
  sendTextMessage(destinationJid: string, text: string): Promise<void>;
}

export const WHATSAPP_MESSAGING_PORT = Symbol('WHATSAPP_MESSAGING_PORT');
