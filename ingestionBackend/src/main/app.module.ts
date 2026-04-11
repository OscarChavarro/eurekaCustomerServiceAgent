import { Module } from '@nestjs/common';
import { ContactsDirectoryIndexService } from './adapters/inbound/csv/contacts-directory-index.service';
import { FileSystemConversationCsvSourceAdapter } from './adapters/inbound/csv/file-system-conversation-csv-source.adapter';
import { ImazingCsvFileNameService } from './adapters/inbound/csv/imazing-csv-file-name.service';
import { ConversationsController } from './adapters/inbound/http/conversations.controller';
import { IngestionController } from './adapters/inbound/http/ingestion.controller';
import { TranscribeController } from './adapters/inbound/http/transcribe.controller';
import { UpdateAudioModelsController } from './adapters/inbound/http/update-audio-models.controller';
import { HttpContactsDirectoryAdapter } from './adapters/outbound/contacts/http-contacts-directory.adapter';
import { FileSystemFailedAudioResourceLogAdapter } from './adapters/outbound/debug/file-system-failed-audio-resource-log.adapter';
import { FileSystemProcessedConversationStageStoreAdapter } from './adapters/outbound/debug/file-system-processed-conversation-stage-store.adapter';
import { BgeEmbeddingAdapter } from './adapters/outbound/embeddings/bge-embedding.adapter';
import { MongoClientProvider } from './adapters/outbound/mongo/mongo-client.provider';
import { MongoConversationsRepositoryAdapter } from './adapters/outbound/mongo/mongo-conversations.repository.adapter';
import { MongoEmbeddingsRepositoryAdapter } from './adapters/outbound/mongo/mongo-embeddings.repository.adapter';
import { QdrantVectorStoreAdapter } from './adapters/outbound/qdrant/qdrant-vector-store.adapter';
import { TOKENS } from './application/ports/tokens';
import { RawAudioTranscriptionOrchestratorService } from './application/services/raw-audio-transcription-orchestrator.service';
import { ConversationChunkingService } from './application/use-cases/kwoledge-ingestion/conversation-chunking.service';
import { ConversationCsvRecordTranslatorService } from './application/use-cases/kwoledge-ingestion/conversation-csv-record-translator.service';
import { ConversationMessageCleaningService } from './application/use-cases/kwoledge-ingestion/conversation-message-cleaning.service';
import { ConversationMediaNormalizationService } from './application/use-cases/kwoledge-ingestion/conversation-media-normalization.service';
import { ConversationStructuringService } from './application/use-cases/kwoledge-ingestion/conversation-structuring.service';
import { FixFilePatternUseCase } from './application/use-cases/fix-file-pattern/fix-file-pattern.use-case';
import { KwoledgeIngestionUseCase } from './application/use-cases/kwoledge-ingestion/kwoledge-ingestion.use-case';
import { UpdateAudioModelsUseCase } from './application/use-cases/update-audio-models/update-audio-models.use-case';
import { AudioTranscribeUseCase } from './application/use-cases/audio-transcribe/audio-transcribe.use-case';
import { ConversationsDeleteAllUseCase } from './application/use-cases/conversations-delete-all/conversations-delete-all.use-case';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { AudioTranscribeWorkerPoolService } from './infrastructure/audio-transcribe/audio-transcribe-worker-pool.service';
import { WavefileAudioWaveformBarsAdapter } from './infrastructure/audio-transcribe/wavefile-audio-waveform-bars.adapter';
import { BgeConnectivityStartupValidator } from './infrastructure/bootstrap/validators/bge-connectivity-startup.validator';
import { ContactsBackendConnectivityStartupValidator } from './infrastructure/bootstrap/validators/contacts-backend-connectivity-startup.validator';
import { MongoConnectivityStartupValidator } from './infrastructure/bootstrap/validators/mongo-connectivity-startup.validator';
import { ProcessedConversationsFolderStartupValidator } from './infrastructure/bootstrap/validators/processed-conversations-folder-startup.validator';
import { QdrantConnectivityStartupValidator } from './infrastructure/bootstrap/validators/qdrant-connectivity-startup.validator';
import { WhisperFfmpegStartupValidator } from './infrastructure/bootstrap/validators/whisper-ffmpeg-startup.validator';
import { StaticAssetsBaseUrlAdapter } from './infrastructure/config/adapters/static-assets-base-url.adapter';
import { FetchAssetResourceProbeAdapter } from './infrastructure/http/fetch-asset-resource-probe.adapter';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [
    IngestionController,
    TranscribeController,
    ConversationsController,
    UpdateAudioModelsController
  ],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    MongoClientProvider,
    ProcessedConversationsFolderStartupValidator,
    ContactsBackendConnectivityStartupValidator,
    MongoConnectivityStartupValidator,
    WhisperFfmpegStartupValidator,
    QdrantConnectivityStartupValidator,
    BgeConnectivityStartupValidator,
    StartupValidationOrchestrator,
    AudioTranscribeWorkerPoolService,
    WavefileAudioWaveformBarsAdapter,
    StaticAssetsBaseUrlAdapter,
    ContactsDirectoryIndexService,
    ImazingCsvFileNameService,
    ConversationCsvRecordTranslatorService,
    ConversationMessageCleaningService,
    ConversationMediaNormalizationService,
    ConversationStructuringService,
    ConversationChunkingService,
    FixFilePatternUseCase,
    RawAudioTranscriptionOrchestratorService,
    KwoledgeIngestionUseCase,
    UpdateAudioModelsUseCase,
    AudioTranscribeUseCase,
    ConversationsDeleteAllUseCase,
    {
      provide: TOKENS.AudioTranscribeWorkerPoolPort,
      useExisting: AudioTranscribeWorkerPoolService
    },
    {
      provide: TOKENS.AudioWaveformBarsPort,
      useExisting: WavefileAudioWaveformBarsAdapter
    },
    {
      provide: TOKENS.StaticAssetsBaseUrlPort,
      useExisting: StaticAssetsBaseUrlAdapter
    },
    {
      provide: TOKENS.AssetResourceProbePort,
      useClass: FetchAssetResourceProbeAdapter
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
      provide: TOKENS.FailedAudioResourceLogPort,
      useClass: FileSystemFailedAudioResourceLogAdapter
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
