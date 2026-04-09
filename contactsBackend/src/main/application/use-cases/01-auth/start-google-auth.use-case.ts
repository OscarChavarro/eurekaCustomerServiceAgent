import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GoogleAuthSessionStorePort } from '../../ports/outbound/auth/google-auth-session-store.port';
import type { GoogleAuthPort } from '../../ports/outbound/google/google-auth.port';
import { TOKENS } from '../../ports/tokens';

export type StartGoogleAuthResult = {
  state: string;
  authorizationUrl: string;
};

@Injectable()
export class StartGoogleAuthUseCase {
  constructor(
    @Inject(TOKENS.GoogleAuthPort)
    private readonly googleAuthPort: GoogleAuthPort,
    @Inject(TOKENS.GoogleAuthSessionStorePort)
    private readonly googleAuthSessionStorePort: GoogleAuthSessionStorePort
  ) {}

  public async execute(): Promise<StartGoogleAuthResult> {
    const state = randomUUID();
    await this.googleAuthSessionStorePort.savePendingState(state);

    return {
      state,
      authorizationUrl: this.googleAuthPort.buildAuthorizationUrl(state)
    };
  }
}
