import { Module } from '@nestjs/common';
import { FileSystemConversationCsvSourceAdapter } from './adapters/inbound/csv/file-system-conversation-csv-source.adapter';
import { IngestionController } from './adapters/inbound/http/ingestion.controller';
import { LocalHashEmbeddingGeneratorAdapter } from './adapters/outbound/embeddings/local-hash-embedding-generator.adapter';
import { QdrantVectorStoreAdapter } from './adapters/outbound/qdrant/qdrant-vector-store.adapter';
import { TOKENS } from './application/ports/tokens';
import { ConversationCsvRecordTranslatorService } from './application/use-cases/kwoledge-ingestion/conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './application/use-cases/kwoledge-ingestion/conversation-message-cleaning.service';
import { KwoledgeIngestionUseCase } from './application/use-cases/kwoledge-ingestion/kwoledge-ingestion.use-case';
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
    {
      provide: TOKENS.IngestionRuntimeConfigPort,
      useClass: ServiceConfigIngestionRuntimeConfigAdapter
    },
    ConversationCsvRecordTranslatorService,
    ConversationMessageCleaningService,
    KwoledgeIngestionUseCase,
    {
      provide: TOKENS.ConversationCsvSourcePort,
      useClass: FileSystemConversationCsvSourceAdapter
    },
    {
      provide: TOKENS.EmbeddingGeneratorPort,
      useClass: LocalHashEmbeddingGeneratorAdapter
    },
    {
      provide: TOKENS.VectorStorePort,
      useClass: QdrantVectorStoreAdapter
    }
  ]
})
export class AppModule {}
