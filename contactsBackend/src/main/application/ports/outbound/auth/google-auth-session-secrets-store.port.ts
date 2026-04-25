import type { GoogleTokenSet } from './google-auth-session-store.port';

export interface GoogleAuthSessionSecretsStorePort {
  saveTokenSet(tokenSet: GoogleTokenSet): Promise<void>;
}
