import { Module } from '@nestjs/common';
import { ConversationsController } from './adapters/inbound/http/conversations.controller';
import { MessagesController } from './adapters/inbound/http/messages.controller';
import { MongoClientProvider } from './adapters/outbound/mongo/mongo-client.provider';
import { MongoConversationsRepositoryAdapter } from './adapters/outbound/mongo/mongo-conversations.repository.adapter';
import { GetConversationIdsUseCase } from './application/use-cases/get-conversation-ids/get-conversation-ids.use-case';
import { GetConversationMessagesUseCase } from './application/use-cases/get-conversation-messages/get-conversation-messages.use-case';
import { TOKENS } from './application/ports/tokens';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { MongoConnectivityStartupValidator } from './infrastructure/bootstrap/validators/mongo-connectivity-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [ConversationsController, MessagesController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    MongoClientProvider,
    MongoConnectivityStartupValidator,
    StartupValidationOrchestrator,
    GetConversationIdsUseCase,
    GetConversationMessagesUseCase,
    {
      provide: TOKENS.ConversationsReadRepositoryPort,
      useClass: MongoConversationsRepositoryAdapter
    }
  ]
})
export class AppModule {}
