import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './adapters/inbound/http/chat-completions.controller';
import { FetchLlmChatCompletionsAdapter } from './adapters/outbound/http/fetch-llm-chat-completions.adapter';
import { TOKENS } from './application/ports/tokens';
import { StreamChatCompletionsUseCase } from './application/use-cases/chat-completions/stream-chat-completions.use-case';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [ChatCompletionsController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    StreamChatCompletionsUseCase,
    {
      provide: TOKENS.LlmChatCompletionsPort,
      useClass: FetchLlmChatCompletionsAdapter
    }
  ]
})
export class AppModule {}
