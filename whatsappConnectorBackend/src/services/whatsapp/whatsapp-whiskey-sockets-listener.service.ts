import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProcessIncomingWhatsappMessageUseCase } from 'src/application/usecases/process-incoming-whatsapp-message.usecase';
import { Configuration } from 'src/config/configuration';
import { CONTACTS_BACKEND_PORT, ContactEntry, ContactsBackendPort } from 'src/ports/outbound/contacts-backend.port';
import { WhatsappWhiskeySocketsService } from 'src/services/whatsapp/whatsapp-whiskey-sockets.service';

type MessageUpsertPayload = {
  messages?: Array<{
    key?: {
      remoteJid?: string;
      participant?: string;
      fromMe?: boolean;
    };
  }>;
};

@Injectable()
export class WhatsappWhiskeySocketsListenerService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappWhiskeySocketsListenerService.name);
  private contacts: ContactEntry[] = [];

  constructor(
    private readonly configuration: Configuration,
    private readonly whatsappWhiskeySocketsService: WhatsappWhiskeySocketsService,
    private readonly processIncomingWhatsappMessageUseCase: ProcessIncomingWhatsappMessageUseCase,
    @Inject(CONTACTS_BACKEND_PORT)
    private readonly contactsBackend: ContactsBackendPort
  ) {
    this.whatsappWhiskeySocketsService.onIncomingMessage((payload) => {
      this.handleIncomingMessage(payload);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.contactsBackend.assertHealth();
    this.contacts = await this.contactsBackend.listContacts();
    this.logger.log(
      `contactsBackend connectivity confirmed. Loaded ${this.contacts.length} contacts before WhatsApp startup.`
    );

    await this.whatsappWhiskeySocketsService.initialize();
  }

  private handleIncomingMessage(payload: unknown): void {
    const messages = this.extractMessages(payload);
    for (const message of messages) {
      const key = message.key;
      if (!key || key.fromMe) {
        continue;
      }

      const senderJid = this.resolveSenderJid(key);
      if (!senderJid) {
        continue;
      }

      const senderWhatsapp = this.toWhatsappIdentifier(senderJid);
      this.processIncomingWhatsappMessageUseCase.execute({
        agentPhoneNumber: this.configuration.whiskeySocketsWhatsappAccountPhoneNumber,
        senderPhoneNumber: senderWhatsapp,
        contacts: this.contacts,
        messageReceiveMode: this.configuration.whatsappMessageReceiveMode,
        rawPayload: payload
      });
    }
  }

  private extractMessages(payload: unknown): NonNullable<MessageUpsertPayload['messages']> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const typedPayload = payload as MessageUpsertPayload;
    return Array.isArray(typedPayload.messages) ? typedPayload.messages : [];
  }

  private resolveSenderJid(key: { remoteJid?: string; participant?: string }): string | null {
    const participant = key.participant?.trim();
    if (participant) {
      return participant;
    }

    const remoteJid = key.remoteJid?.trim();
    return remoteJid || null;
  }

  private toWhatsappIdentifier(jid: string): string {
    const atIndex = jid.indexOf('@');
    const base = atIndex >= 0 ? jid.slice(0, atIndex) : jid;
    const cleaned = base.trim();

    if (cleaned.length === 0) {
      this.logger.warn(`Incoming message has empty JID base: "${jid}".`);
      return jid;
    }

    if (/^\d+$/.test(cleaned)) {
      return `+${cleaned}`;
    }

    return cleaned;
  }
}
