import { Injectable } from '@nestjs/common';
import { ProcessIncomingWhatsappMessageContext } from 'src/application/context/process-incoming-whatsapp-message.context';

@Injectable()
export class ProcessIncomingWhatsappMessageUseCase {
  execute(context: ProcessIncomingWhatsappMessageContext): void {
    if (context.messageReceiveMode === 'SILENT') {
      return;
    }

    if (context.messageReceiveMode === 'JSON') {
      console.log(JSON.stringify(context.rawPayload ?? {}, null, 2));
      return;
    }

    console.log(context.senderPhoneNumber);
  }
}
