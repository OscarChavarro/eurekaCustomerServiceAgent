import { Module } from '@nestjs/common';
import { ContactsDirectoryIndexService } from './adapters/inbound/csv/contacts-directory-index.service';
import { FileSystemConversationCsvSourceAdapter } from './adapters/inbound/csv/file-system-conversation-csv-source.adapter';
import { ImazingCsvFileNameService } from './adapters/inbound/csv/imazing-csv-file-name.service';
import { IngestionController } from './adapters/inbound/http/ingestion.controller';
import { TranscribeController } from './adapters/inbound/http/transcribe.controller';
import { HttpContactsDirectoryAdapter } from './adapters/outbound/contacts/http-contacts-directory.adapter';
import { FileSystemProcessedConversationStageStoreAdapter } from './adapters/outbound/debug/file-system-processed-conversation-stage-store.adapter';
import { BgeEmbeddingAdapter } from './adapters/outbound/embeddings/bge-embedding.adapter';
import { MongoClientProvider } from './adapters/outbound/mongo/mongo-client.provider';
import { MongoConversationsRepositoryAdapter } from './adapters/outbound/mongo/mongo-conversations.repository.adapter';
import { MongoEmbeddingsRepositoryAdapter } from './adapters/outbound/mongo/mongo-embeddings.repository.adapter';
import { QdrantVectorStoreAdapter } from './adapters/outbound/qdrant/qdrant-vector-store.adapter';
import { TOKENS } from './application/ports/tokens';
import { ConversationChunkingService } from './application/use-cases/kwoledge-ingestion/conversation-chunking.service';
import { ConversationCsvRecordTranslatorService } from './application/use-cases/kwoledge-ingestion/conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './application/use-cases/kwoledge-ingestion/conversation-message-cleaning.service';
import { ConversationStructuringService } from './application/use-cases/kwoledge-ingestion/conversation-structuring.service';
import { KwoledgeIngestionUseCase } from './application/use-cases/kwoledge-ingestion/kwoledge-ingestion.use-case';
import { AudioTranscribeUseCase } from './application/use-cases/audio-transcribe/audio-transcribe.use-case';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { AudioTranscribeWorkerPoolService } from './infrastructure/audio-transcribe/audio-transcribe-worker-pool.service';
import { BgeConnectivityStartupValidator } from './infrastructure/bootstrap/validators/bge-connectivity-startup.validator';
import { ContactsBackendConnectivityStartupValidator } from './infrastructure/bootstrap/validators/contacts-backend-connectivity-startup.validator';
import { MongoConnectivityStartupValidator } from './infrastructure/bootstrap/validators/mongo-connectivity-startup.validator';
import { ProcessedConversationsFolderStartupValidator } from './infrastructure/bootstrap/validators/processed-conversations-folder-startup.validator';
import { QdrantConnectivityStartupValidator } from './infrastructure/bootstrap/validators/qdrant-connectivity-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [IngestionController, TranscribeController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    MongoClientProvider,
    ProcessedConversationsFolderStartupValidator,
    ContactsBackendConnectivityStartupValidator,
    MongoConnectivityStartupValidator,
    QdrantConnectivityStartupValidator,
    BgeConnectivityStartupValidator,
    StartupValidationOrchestrator,
    AudioTranscribeWorkerPoolService,
    ContactsDirectoryIndexService,
    ImazingCsvFileNameService,
    ConversationCsvRecordTranslatorService,
    ConversationMessageCleaningService,
    ConversationStructuringService,
    ConversationChunkingService,
    KwoledgeIngestionUseCase,
    AudioTranscribeUseCase,
    {
      provide: TOKENS.AudioTranscribeWorkerPoolPort,
      useExisting: AudioTranscribeWorkerPoolService
    },
    {
      provide: TOKENS.ConversationCsvSourcePort,
      useClass: FileSystemConversationCsvSourceAdapter
    },
    {
      provide: TOKENS.EmbeddingPort,
      useClass: BgeEmbeddingAdapter
    },
    {
      provide: TOKENS.ContactsDirectoryPort,
      useClass: HttpContactsDirectoryAdapter
    },
    {
      provide: TOKENS.VectorStorePort,
      useClass: QdrantVectorStoreAdapter
    },
    {
      provide: TOKENS.ProcessedConversationStageStorePort,
      useClass: FileSystemProcessedConversationStageStoreAdapter
    },
    {
      provide: TOKENS.ConversationsRepositoryPort,
      useClass: MongoConversationsRepositoryAdapter
    },
    {
      provide: TOKENS.EmbeddingsRepositoryPort,
      useClass: MongoEmbeddingsRepositoryAdapter
    }
  ]
})
export class AppModule {}
