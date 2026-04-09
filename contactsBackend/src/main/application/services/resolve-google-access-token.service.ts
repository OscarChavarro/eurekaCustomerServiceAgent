import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { GoogleAuthSessionStorePort } from '../ports/outbound/auth/google-auth-session-store.port';
import type { GoogleAuthPort } from '../ports/outbound/google/google-auth.port';
import { TOKENS } from '../ports/tokens';

@Injectable()
export class ResolveGoogleAccessTokenService {
  constructor(
    @Inject(TOKENS.GoogleAuthSessionStorePort)
    private readonly googleAuthSessionStorePort: GoogleAuthSessionStorePort,
    @Inject(TOKENS.GoogleAuthPort)
    private readonly googleAuthPort: GoogleAuthPort
  ) {}

  public async execute(): Promise<string> {
    const tokens = await this.googleAuthSessionStorePort.getTokenSet();

    if (!tokens) {
      throw new UnauthorizedException('Google account is not authenticated yet. Call /auth/google/start first.');
    }

    const now = Date.now();
    const expiryDateMs = tokens.expiryDateMs ?? 0;
    const hasValidAccessToken = tokens.accessToken.trim().length > 0 && (expiryDateMs === 0 || now < expiryDateMs - 30_000);

    if (hasValidAccessToken) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      throw new UnauthorizedException('Access token expired and no refresh token is available. Re-authenticate with Google.');
    }

    const refreshed = await this.googleAuthPort.refreshAccessToken(tokens.refreshToken);
    const merged = {
      ...tokens,
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken
    };

    await this.googleAuthSessionStorePort.saveTokenSet(merged);
    return merged.accessToken;
  }
}
