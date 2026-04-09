import { Injectable } from '@nestjs/common';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class GoogleOauthSettingsStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'GoogleOauthSettingsStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'Google OAuth settings look valid.';
  }

  public async validate(): Promise<void> {
    const config = this.serviceConfig.googleOauthWebConfig;

    if (!config.redirectUri.includes('/auth/google/callback')) {
      throw new Error('Google redirect URI must include /auth/google/callback.');
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('Google OAuth client credentials are required.');
    }
  }
}
