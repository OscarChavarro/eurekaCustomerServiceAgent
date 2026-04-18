import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProcessIncomingWhatsappMessageContext } from 'src/application/context/process-incoming-whatsapp-message.context';
import { MessageProcessingStrategy } from 'src/application/strategies/message-processing.strategy';
import { RETRIEVAL_BACKEND_PORT, RetrievalBackendPort } from 'src/ports/outbound/retrieval-backend.port';
import { WHATSAPP_MESSAGING_PORT, WhatsappMessagingPort } from 'src/ports/outbound/whatsapp-messaging.port';

@Injectable()
export class AgentControlMessageProcessingStrategy implements MessageProcessingStrategy {
  private readonly logger = new Logger(AgentControlMessageProcessingStrategy.name);

  constructor(
    @Inject(RETRIEVAL_BACKEND_PORT)
    private readonly retrievalBackend: RetrievalBackendPort,
    @Inject(WHATSAPP_MESSAGING_PORT)
    private readonly whatsappMessaging: WhatsappMessagingPort
  ) {}

  canHandle(context: ProcessIncomingWhatsappMessageContext): boolean {
    return context.incomingTexts.some((text) => /\beury\b/i.test(text));
  }

  async execute(context: ProcessIncomingWhatsappMessageContext): Promise<void> {
    if (!context.conversationJid) {
      this.logger.warn('AgentControl strategy matched but conversation JID is missing.');
      return;
    }

    const routedPrompt = this.extractPromptWithoutAgentName(context.incomingTexts);
    if (!routedPrompt) {
      this.logger.warn('AgentControl strategy matched but prompt became empty after removing "Eury".');
      return;
    }

    const customerId = context.senderPhoneNumber.replace(/[^\d+]/g, '') || context.senderPhoneNumber;
    const assistantResponse = await this.retrievalBackend.completeChat(routedPrompt, customerId);
    await this.whatsappMessaging.sendTextMessage(context.conversationJid, assistantResponse);
  }

  private extractPromptWithoutAgentName(incomingTexts: string[]): string {
    for (const text of incomingTexts) {
      if (!/\beury\b/i.test(text)) {
        continue;
      }

      const withoutName = text.replace(/\beury\b/gi, ' ').replace(/\s+/g, ' ').trim();
      if (withoutName.length > 0) {
        return withoutName;
      }
    }

    return '';
  }
}
