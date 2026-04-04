import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { FrontendSecretsService } from './core/api/services/frontend-secrets.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [FrontendSecretsService],
      useFactory: (frontendSecretsService: FrontendSecretsService) => {
        return () => frontendSecretsService.load();
      }
    }
  ],
};
