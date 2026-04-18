import { ProcessIncomingWhatsappMessageContext } from 'src/application/context/process-incoming-whatsapp-message.context';

export interface MessageProcessingStrategy {
  canHandle(context: ProcessIncomingWhatsappMessageContext): boolean;
  execute(context: ProcessIncomingWhatsappMessageContext): Promise<void>;
}
