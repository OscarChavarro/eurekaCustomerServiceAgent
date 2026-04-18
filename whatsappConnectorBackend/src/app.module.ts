import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessIncomingWhatsappMessageUseCase } from 'src/application/usecases/process-incoming-whatsapp-message.usecase';
import { Configuration } from 'src/config/configuration';
import { ContactsBackendHttpAdapter } from 'src/infrastructure/contacts/contacts-backend-http.adapter';
import { CONTACTS_BACKEND_PORT } from 'src/ports/outbound/contacts-backend.port';
import { WhatsappWhiskeySocketsListenerService } from 'src/services/whatsapp/whatsapp-whiskey-sockets-listener.service';
import { WhatsappWhiskeySocketsService } from 'src/services/whatsapp/whatsapp-whiskey-sockets.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    })
  ],
  providers: [
    Configuration,
    ProcessIncomingWhatsappMessageUseCase,
    WhatsappWhiskeySocketsService,
    WhatsappWhiskeySocketsListenerService,
    ContactsBackendHttpAdapter,
    {
      provide: CONTACTS_BACKEND_PORT,
      useExisting: ContactsBackendHttpAdapter
    }
  ]
})
export class AppModule {}
