import { Module } from '@nestjs/common';
import { AuthGoogleController } from './adapters/inbound/http/auth-google.controller';
import { FileSystemGoogleAuthSessionSecretsStoreAdapter } from './adapters/outbound/auth/file-system-google-auth-session-secrets-store.adapter';
import { ContactsController } from './adapters/inbound/http/contacts.controller';
import { HealthController } from './adapters/inbound/http/health.controller';
import { FileSystemGoogleAuthSessionStoreAdapter } from './adapters/outbound/auth/file-system-google-auth-session-store.adapter';
import { GooglePeopleApiAdapter } from './adapters/outbound/google/google-people-api.adapter';
import { TOKENS } from './application/ports/tokens';
import { ResolveGoogleAccessTokenService } from './application/services/resolve-google-access-token.service';
import { CompleteGoogleAuthCallbackUseCase } from './application/use-cases/01-auth/complete-google-auth-callback.use-case';
import { StartGoogleAuthUseCase } from './application/use-cases/01-auth/start-google-auth.use-case';
import { CreateGoogleContactUseCase } from './application/use-cases/02-contacts/create-google-contact.use-case';
import { DeleteGoogleContactsUseCase } from './application/use-cases/02-contacts/delete-google-contacts.use-case';
import { ListGoogleContactsUseCase } from './application/use-cases/02-contacts/list-google-contacts.use-case';
import { PatchGoogleContactUseCase } from './application/use-cases/02-contacts/patch-google-contact.use-case';
import { StartupValidationOrchestrator } from './infrastructure/bootstrap/startup-validation.orchestrator';
import { GoogleOauthSettingsStartupValidator } from './infrastructure/bootstrap/validators/google-oauth-settings-startup.validator';
import { ServiceConfig } from './infrastructure/config/service.config';
import { SecretsConfig } from './infrastructure/config/settings/secrets.config';
import { SettingsConfig } from './infrastructure/config/settings/settings.config';

@Module({
  controllers: [AuthGoogleController, ContactsController, HealthController],
  providers: [
    SettingsConfig,
    SecretsConfig,
    ServiceConfig,
    GoogleOauthSettingsStartupValidator,
    StartupValidationOrchestrator,
    ResolveGoogleAccessTokenService,
    StartGoogleAuthUseCase,
    CompleteGoogleAuthCallbackUseCase,
    ListGoogleContactsUseCase,
    CreateGoogleContactUseCase,
    PatchGoogleContactUseCase,
    DeleteGoogleContactsUseCase,
    GooglePeopleApiAdapter,
    {
      provide: TOKENS.GoogleAuthPort,
      useExisting: GooglePeopleApiAdapter
    },
    {
      provide: TOKENS.GooglePeoplePort,
      useExisting: GooglePeopleApiAdapter
    },
    {
      provide: TOKENS.GoogleAuthSessionStorePort,
      useClass: FileSystemGoogleAuthSessionStoreAdapter
    },
    {
      provide: TOKENS.GoogleAuthSessionSecretsStorePort,
      useClass: FileSystemGoogleAuthSessionSecretsStoreAdapter
    }
  ]
})
export class AppModule {}
