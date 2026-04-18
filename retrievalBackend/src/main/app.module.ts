import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './adapters/inbound/http/chat-completions.controller';
import { HealthController } from './adapters/inbound/http/health.controller';
import { NearestEmbeddingsController } from './adapters/inbound/http/nearest-embeddings.controller';
import { NaiveContextGenerator } from './adapters/outbound/context/naive-context-generator';
import { VectorSearchContextGenerator } from './adapters/outbound/context/vector-search-context-generator';
import { NearestEmbeddingsConfigAdapter } from './adapters/outbound/config/nearest-embeddings-config.adapter';
import { FetchLlmChatCompletionsAdapter } from './adapters/outbound/http/fetch-llm-chat-completions.adapter';
import { TOKENS } from './application/ports/tokens';
import { GenerateContextUseCase } from './application/use-cases/01-context-builder/generate-context.use-case';
import { CallLlmChatCompletionsUseCase } from './application/use-cases/02-llm-call/call-llm-chat-completions.use-case';
import { StreamChatCompletionsUseCase } from './application/use-cases/02-llm-call/stream-chat-completions.use-case';
import { PostProcessChatCompletionsUseCase } from './application/use-cases/03-post-processing/post-process-chat-completions.use-case';
import { FindNearestEmbeddingsUseCase } from './application/use-cases/support/diagnostics/find-nearest-embeddings.use-case';
import type { ContextGenerator } from './application/ports/outbound/context/context-generator.port';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { BgeConnectivityStartupValidator } from './infrastructure/bootstrap/validators/bge-connectivity-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';
import { HeuristicContextBuilderService } from '../application/services/context-builder.service';

@Module({
  controllers: [ChatCompletionsController, NearestEmbeddingsController, HealthController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    BgeConnectivityStartupValidator,
    StartupValidationOrchestrator,
    NaiveContextGenerator,
    VectorSearchContextGenerator,
    NearestEmbeddingsConfigAdapter,
    HeuristicContextBuilderService,
    GenerateContextUseCase,
    CallLlmChatCompletionsUseCase,
    PostProcessChatCompletionsUseCase,
    StreamChatCompletionsUseCase,
    FindNearestEmbeddingsUseCase,
    {
      provide: TOKENS.ContextGenerator,
      inject: [ServiceConfig, NaiveContextGenerator, VectorSearchContextGenerator],
      useFactory: (
        serviceConfig: ServiceConfig,
        naiveContextGenerator: NaiveContextGenerator,
        vectorSearchContextGenerator: VectorSearchContextGenerator
      ): ContextGenerator => {
        return serviceConfig.contextGeneratorConfig.implementation === 'vector-search'
          ? vectorSearchContextGenerator
          : naiveContextGenerator;
      }
    },
    {
      provide: TOKENS.LlmChatCompletionsPort,
      useClass: FetchLlmChatCompletionsAdapter
    },
    {
      provide: TOKENS.NearestEmbeddingsConfigPort,
      useClass: NearestEmbeddingsConfigAdapter
    }
  ]
})
export class AppModule {}
