import { Module } from '@nestjs/common';
import { HealthController } from 'src/adapters/inbound/http/health.controller';
import { ProfileImageController } from 'src/adapters/inbound/http/profile-image.controller';
import { AgentControlMessageProcessingStrategy } from 'src/application/strategies/agent-control-message-processing.strategy';
import { DummyMessageProcessingStrategy } from 'src/application/strategies/dummy-message-processing.strategy';
import { GetProfileImageUseCase } from 'src/application/usecases/get-profile-image.usecase';
import { ConfigModule } from '@nestjs/config';
import { ProcessIncomingWhatsappMessageUseCase } from 'src/application/usecases/process-incoming-whatsapp-message.usecase';
import { Configuration } from 'src/config/configuration';
import { ContactsBackendHttpAdapter } from 'src/infrastructure/contacts/contacts-backend-http.adapter';
import { RetrievalBackendHttpAdapter } from 'src/infrastructure/retrieval/retrieval-backend-http.adapter';
import { CONTACTS_BACKEND_PORT } from 'src/ports/outbound/contacts-backend.port';
import { RETRIEVAL_BACKEND_PORT } from 'src/ports/outbound/retrieval-backend.port';
import { WHATSAPP_MESSAGING_PORT } from 'src/ports/outbound/whatsapp-messaging.port';
import { WHATSAPP_PROFILE_PORT } from 'src/ports/outbound/whatsapp-profile.port';
import { WhatsappWhiskeySocketsListenerService } from 'src/services/whatsapp/whatsapp-whiskey-sockets-listener.service';
import { WhatsappWhiskeySocketsService } from 'src/services/whatsapp/whatsapp-whiskey-sockets.service';

@Module({
  controllers: [HealthController, ProfileImageController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    })
  ],
  providers: [
    Configuration,
    AgentControlMessageProcessingStrategy,
    DummyMessageProcessingStrategy,
    GetProfileImageUseCase,
    ProcessIncomingWhatsappMessageUseCase,
    WhatsappWhiskeySocketsService,
    WhatsappWhiskeySocketsListenerService,
    ContactsBackendHttpAdapter,
    RetrievalBackendHttpAdapter,
    {
      provide: CONTACTS_BACKEND_PORT,
      useExisting: ContactsBackendHttpAdapter
    },
    {
      provide: RETRIEVAL_BACKEND_PORT,
      useExisting: RetrievalBackendHttpAdapter
    },
    {
      provide: WHATSAPP_MESSAGING_PORT,
      useExisting: WhatsappWhiskeySocketsService
    },
    {
      provide: WHATSAPP_PROFILE_PORT,
      useExisting: WhatsappWhiskeySocketsService
    }
  ]
})
export class AppModule {}
