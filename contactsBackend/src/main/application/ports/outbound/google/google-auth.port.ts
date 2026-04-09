import type { GoogleTokenSet } from '../auth/google-auth-session-store.port';

export type ExchangeCodeForTokenCommand = {
  code: string;
};

export interface GoogleAuthPort {
  buildAuthorizationUrl(state: string): string;
  exchangeCodeForToken(command: ExchangeCodeForTokenCommand): Promise<GoogleTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet>;
}
