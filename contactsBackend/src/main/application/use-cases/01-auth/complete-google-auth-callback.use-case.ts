import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { GoogleAuthSessionSecretsStorePort } from '../../ports/outbound/auth/google-auth-session-secrets-store.port';
import type { GoogleAuthSessionStorePort } from '../../ports/outbound/auth/google-auth-session-store.port';
import type { GoogleAuthPort } from '../../ports/outbound/google/google-auth.port';
import { TOKENS } from '../../ports/tokens';

export type CompleteGoogleAuthCallbackCommand = {
  code: string;
  state: string;
};

export type CompleteGoogleAuthCallbackResult = {
  ok: true;
  message: string;
};

@Injectable()
export class CompleteGoogleAuthCallbackUseCase {
  constructor(
    @Inject(TOKENS.GoogleAuthPort)
    private readonly googleAuthPort: GoogleAuthPort,
    @Inject(TOKENS.GoogleAuthSessionStorePort)
    private readonly googleAuthSessionStorePort: GoogleAuthSessionStorePort,
    @Inject(TOKENS.GoogleAuthSessionSecretsStorePort)
    private readonly googleAuthSessionSecretsStorePort: GoogleAuthSessionSecretsStorePort
  ) {}

  public async execute(command: CompleteGoogleAuthCallbackCommand): Promise<CompleteGoogleAuthCallbackResult> {
    const consumed = await this.googleAuthSessionStorePort.consumePendingState(command.state);

    if (!consumed) {
      throw new BadRequestException('Invalid or expired OAuth state. Start authentication again.');
    }

    const tokens = await this.googleAuthPort.exchangeCodeForToken({ code: command.code });
    await this.googleAuthSessionStorePort.saveTokenSet(tokens);
    await this.googleAuthSessionSecretsStorePort.saveTokenSet(tokens);

    return {
      ok: true,
      message:
        'Google authentication completed. Token set stored in output/google-auth-session.json and synced into secrets.json (googleAuthSession.tokenSet). Contacts endpoints are ready to use.'
    };
  }
}
