import { Module } from '@nestjs/common';
import { NormalizePathController } from './adapters/inbound/http/normalize-path.controller';
import { HealthController } from './adapters/inbound/http/health.controller';
import { ContactsBackendHttpAdapter } from './adapters/outbound/contacts/contacts-backend-http.adapter';
import { SimpleCsvParser } from './adapters/outbound/csv/simple-csv-parser.adapter';
import { NodeFileSystemAdapter } from './adapters/outbound/fs/node-file-system.adapter';
import { ConsoleLoggerAdapter } from './adapters/outbound/logging/console-logger.adapter';
import { PreprocessWhatsappExportUseCase } from './application/PreprocessWhatsappExportUseCase';
import { TOKENS } from './application/ports/tokens';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { ContactsBackendConnectivityStartupValidator } from './infrastructure/bootstrap/validators/contacts-backend-connectivity-startup.validator';
import { DisabledContactsConfig } from './infrastructure/config/disabled-contacts.config';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';

@Module({
  controllers: [HealthController, NormalizePathController],
  providers: [
    SecretsConfig,
    ServiceConfig,
    DisabledContactsConfig,
    ContactsBackendConnectivityStartupValidator,
    StartupValidationOrchestrator,
    PreprocessWhatsappExportUseCase,
    {
      provide: TOKENS.FileSystemPort,
      useClass: NodeFileSystemAdapter
    },
    {
      provide: TOKENS.CsvParserPort,
      useClass: SimpleCsvParser
    },
    {
      provide: TOKENS.ContactsBackendPort,
      useClass: ContactsBackendHttpAdapter
    },
    {
      provide: TOKENS.LoggerPort,
      useClass: ConsoleLoggerAdapter
    },
    {
      provide: TOKENS.DisabledContactsPort,
      useExisting: DisabledContactsConfig
    }
  ]
})
export class AppModule {}
