import { Module } from '@nestjs/common';
import { ConversationsController } from './adapters/inbound/http/conversations.controller';
import { MessageRatingController } from './adapters/inbound/http/message-rating.controller';
import { MessageRatingsController } from './adapters/inbound/http/message-ratings.controller';
import { MessagesController } from './adapters/inbound/http/messages.controller';
import { PhonePrefixController } from './adapters/inbound/http/phone-prefix.controller';
import { HardcodedPhonePrefixCatalogAdapter } from './adapters/outbound/hardcoded/hardcoded-phone-prefix-catalog.adapter';
import { MongoClientProvider } from './adapters/outbound/mongo/mongo-client.provider';
import { MongoConversationsRepositoryAdapter } from './adapters/outbound/mongo/mongo-conversations.repository.adapter';
import { MongoMessageRatingRepositoryAdapter } from './adapters/outbound/mongo/mongo-message-rating.repository.adapter';
import { GetConversationIdsUseCase } from './application/use-cases/get-conversation-ids/get-conversation-ids.use-case';
import { GetConversationMessagesUseCase } from './application/use-cases/get-conversation-messages/get-conversation-messages.use-case';
import { GetPhonePrefixUseCase } from './application/use-cases/get-phone-prefix/get-phone-prefix.use-case';
import { GetMessageRatingsUseCase } from './application/use-cases/get-message-ratings/get-message-ratings.use-case';
import { RateMessageUseCase } from './application/use-cases/rate-message/rate-message.use-case';
import { TOKENS } from './application/ports/tokens';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { MongoConnectivityStartupValidator } from './infrastructure/bootstrap/validators/mongo-connectivity-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [
    ConversationsController,
    MessagesController,
    PhonePrefixController,
    MessageRatingController,
    MessageRatingsController
  ],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    MongoClientProvider,
    MongoConnectivityStartupValidator,
    StartupValidationOrchestrator,
    GetConversationIdsUseCase,
    GetConversationMessagesUseCase,
    GetPhonePrefixUseCase,
    GetMessageRatingsUseCase,
    RateMessageUseCase,
    {
      provide: TOKENS.ConversationsReadRepositoryPort,
      useClass: MongoConversationsRepositoryAdapter
    },
    {
      provide: TOKENS.PhonePrefixCatalogPort,
      useClass: HardcodedPhonePrefixCatalogAdapter
    },
    {
      provide: TOKENS.MessageRatingRepositoryPort,
      useClass: MongoMessageRatingRepositoryAdapter
    }
  ]
})
export class AppModule {}
