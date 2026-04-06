import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './adapters/inbound/http/chat-completions.controller';
import { NaiveContextGenerator } from './adapters/outbound/context/naive-context-generator';
import { VectorSearchContextGenerator } from './adapters/outbound/context/vector-search-context-generator';
import { FetchLlmChatCompletionsAdapter } from './adapters/outbound/http/fetch-llm-chat-completions.adapter';
import { TOKENS } from './application/ports/tokens';
import { StreamChatCompletionsUseCase } from './application/use-cases/chat-completions/stream-chat-completions.use-case';
import { GenerateContextUseCase } from './application/use-cases/context-generation/generate-context.use-case';
import type { ContextGenerator } from './application/ports/outbound/context/context-generator.port';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [ChatCompletionsController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    NaiveContextGenerator,
    VectorSearchContextGenerator,
    GenerateContextUseCase,
    StreamChatCompletionsUseCase,
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
    }
  ]
})
export class AppModule {}
