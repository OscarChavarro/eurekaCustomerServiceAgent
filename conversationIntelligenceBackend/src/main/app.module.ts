import { Module } from '@nestjs/common';
import { ConversationStageController } from './adapters/inbound/http/conversation-stage.controller';
import { HealthController } from './adapters/inbound/http/health.controller';
import { BgeEmbeddingAdapter } from './adapters/outbound/http/bge-embedding.adapter';
import { ContactsBackendAdapter } from './adapters/outbound/http/contacts-backend.adapter';
import { ServiceConversationStageInferenceConfigAdapter } from './adapters/outbound/config/service-conversation-stage-inference-config.adapter';
import { OllamaConversationStageClassifierAdapter } from './adapters/outbound/llm/ollama-conversation-stage-classifier.adapter';
import { MongoConversationStageRepository } from './adapters/outbound/persistence/mongo-conversation-stage.repository';
import { QdrantConversationSearchAdapter } from './adapters/outbound/qdrant/qdrant-conversation-search.adapter';
import { GetConversationStageUseCase } from './application/use-cases/get-conversation-stage/get-conversation-stage.use-case';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { BgeConnectivityStartupValidator } from './infrastructure/bootstrap/validators/bge-connectivity-startup.validator';
import { ContactsBackendConnectivityStartupValidator } from './infrastructure/bootstrap/validators/contacts-backend-connectivity-startup.validator';
import { LlmConnectivityStartupValidator } from './infrastructure/bootstrap/validators/llm-connectivity-startup.validator';
import { MongoConnectivityStartupValidator } from './infrastructure/bootstrap/validators/mongo-connectivity-startup.validator';
import { QdrantConnectivityStartupValidator } from './infrastructure/bootstrap/validators/qdrant-connectivity-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';
import { TOKENS } from './ports/tokens';

@Module({
  controllers: [ConversationStageController, HealthController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    MongoConnectivityStartupValidator,
    LlmConnectivityStartupValidator,
    ContactsBackendConnectivityStartupValidator,
    BgeConnectivityStartupValidator,
    QdrantConnectivityStartupValidator,
    StartupValidationOrchestrator,
    {
      provide: TOKENS.ConversationStageRepositoryPort,
      useClass: MongoConversationStageRepository
    },
    {
      provide: TOKENS.ConversationStageInferenceConfigPort,
      useClass: ServiceConversationStageInferenceConfigAdapter
    },
    {
      provide: TOKENS.ContactsPort,
      useClass: ContactsBackendAdapter
    },
    {
      provide: TOKENS.EmbeddingPort,
      useClass: BgeEmbeddingAdapter
    },
    {
      provide: TOKENS.QdrantConversationSearchPort,
      useClass: QdrantConversationSearchAdapter
    },
    {
      provide: TOKENS.LlmConversationStageClassifierPort,
      useClass: OllamaConversationStageClassifierAdapter
    },
    GetConversationStageUseCase
  ]
})
export class AppModule {}
