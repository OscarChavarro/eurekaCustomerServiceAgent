import { Module } from '@nestjs/common';
import { FileSystemConversationCsvSourceAdapter } from './adapters/inbound/csv/file-system-conversation-csv-source.adapter';
import { IngestionController } from './adapters/inbound/http/ingestion.controller';
import { FileSystemProcessedConversationStageStoreAdapter } from './adapters/outbound/debug/file-system-processed-conversation-stage-store.adapter';
import { BgeEmbeddingAdapter } from './adapters/outbound/embeddings/bge-embedding.adapter';
import { QdrantVectorStoreAdapter } from './adapters/outbound/qdrant/qdrant-vector-store.adapter';
import { TOKENS } from './application/ports/tokens';
import { ConversationChunkingService } from './application/use-cases/kwoledge-ingestion/conversation-chunking.service';
import { ConversationCsvRecordTranslatorService } from './application/use-cases/kwoledge-ingestion/conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './application/use-cases/kwoledge-ingestion/conversation-message-cleaning.service';
import { ConversationStructuringService } from './application/use-cases/kwoledge-ingestion/conversation-structuring.service';
import { KwoledgeIngestionUseCase } from './application/use-cases/kwoledge-ingestion/kwoledge-ingestion.use-case';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { BgeConnectivityStartupValidator } from './infrastructure/bootstrap/validators/bge-connectivity-startup.validator';
import { ProcessedConversationsFolderStartupValidator } from './infrastructure/bootstrap/validators/processed-conversations-folder-startup.validator';
import { QdrantConnectivityStartupValidator } from './infrastructure/bootstrap/validators/qdrant-connectivity-startup.validator';
import { ServiceConfigIngestionRuntimeConfigAdapter } from './infrastructure/config/adapters/service-config-ingestion-runtime-config.adapter';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [IngestionController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    ProcessedConversationsFolderStartupValidator,
    QdrantConnectivityStartupValidator,
    BgeConnectivityStartupValidator,
    StartupValidationOrchestrator,
    {
      provide: TOKENS.IngestionRuntimeConfigPort,
      useClass: ServiceConfigIngestionRuntimeConfigAdapter
    },
    ConversationCsvRecordTranslatorService,
    ConversationMessageCleaningService,
    ConversationStructuringService,
    ConversationChunkingService,
    KwoledgeIngestionUseCase,
    {
      provide: TOKENS.ConversationCsvSourcePort,
      useClass: FileSystemConversationCsvSourceAdapter
    },
    {
      provide: TOKENS.EmbeddingPort,
      useClass: BgeEmbeddingAdapter
    },
    {
      provide: TOKENS.VectorStorePort,
      useClass: QdrantVectorStoreAdapter
    },
    {
      provide: TOKENS.ProcessedConversationStageStorePort,
      useClass: FileSystemProcessedConversationStageStoreAdapter
    }
  ]
})
export class AppModule {}
