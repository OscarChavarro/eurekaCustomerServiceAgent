import { Injectable } from '@nestjs/common';
import { ProcessIncomingWhatsappMessageContext } from 'src/application/context/process-incoming-whatsapp-message.context';
import { MessageProcessingStrategy } from 'src/application/strategies/message-processing.strategy';

@Injectable()
export class DummyMessageProcessingStrategy implements MessageProcessingStrategy {
  canHandle(_context: ProcessIncomingWhatsappMessageContext): boolean {
    return true;
  }

  async execute(context: ProcessIncomingWhatsappMessageContext): Promise<void> {
    console.log(JSON.stringify(context.rawPayload ?? {}, null, 2));
  }
}
