import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GoogleAuthSessionStorePort, GoogleTokenSet } from '../../../application/ports/outbound/auth/google-auth-session-store.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';
import { SecretsConfig } from '../../../infrastructure/config/settings/secrets.config';

type PersistedAuthSession = {
  pendingStates: Array<{
    value: string;
    createdAtMs: number;
  }>;
  tokenSet: GoogleTokenSet | null;
};

@Injectable()
export class FileSystemGoogleAuthSessionStoreAdapter implements GoogleAuthSessionStorePort {
  constructor(
    private readonly serviceConfig: ServiceConfig,
    private readonly secretsConfig: SecretsConfig
  ) {}

  public async savePendingState(state: string): Promise<void> {
    const persisted = this.readPersisted();
    const now = Date.now();

    persisted.pendingStates = persisted.pendingStates
      .filter((item) => now - item.createdAtMs <= this.serviceConfig.oauthStateTtlMs)
      .concat([{ value: state, createdAtMs: now }]);

    this.writePersisted(persisted);
  }

  public async consumePendingState(state: string): Promise<boolean> {
    const persisted = this.readPersisted();
    const now = Date.now();

    const freshStates = persisted.pendingStates.filter(
      (item) => now - item.createdAtMs <= this.serviceConfig.oauthStateTtlMs
    );

    const found = freshStates.some((item) => item.value === state);
    persisted.pendingStates = freshStates.filter((item) => item.value !== state);
    this.writePersisted(persisted);

    return found;
  }

  public async getTokenSet(): Promise<GoogleTokenSet | null> {
    const tokenSetFromSecrets = this.readTokenSetFromSecrets();

    if (tokenSetFromSecrets) {
      return tokenSetFromSecrets;
    }

    const persistedTokenSet = this.readPersisted().tokenSet;

    if (persistedTokenSet) {
      return persistedTokenSet;
    }

    return null;
  }

  public async saveTokenSet(tokenSet: GoogleTokenSet): Promise<void> {
    const persisted = this.readPersisted();
    persisted.tokenSet = tokenSet;
    this.writePersisted(persisted);
  }

  private readPersisted(): PersistedAuthSession {
    const filePath = this.serviceConfig.authSessionFilePath;

    if (!existsSync(filePath)) {
      return {
        pendingStates: [],
        tokenSet: null
      };
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedAuthSession;

      return {
        pendingStates: Array.isArray(parsed.pendingStates) ? parsed.pendingStates : [],
        tokenSet: parsed.tokenSet ?? null
      };
    } catch {
      return {
        pendingStates: [],
        tokenSet: null
      };
    }
  }

  private writePersisted(payload: PersistedAuthSession): void {
    const filePath = this.serviceConfig.authSessionFilePath;
    const parentPath = dirname(filePath);
    mkdirSync(parentPath, { recursive: true });
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private readTokenSetFromSecrets(): GoogleTokenSet | null {
    const tokenSet = this.secretsConfig.values.googleAuthSession?.tokenSet;

    if (!tokenSet || typeof tokenSet.accessToken !== 'string' || tokenSet.accessToken.trim().length === 0) {
      return null;
    }

    return {
      accessToken: tokenSet.accessToken.trim(),
      refreshToken: tokenSet.refreshToken?.trim(),
      expiryDateMs: tokenSet.expiryDateMs,
      tokenType: tokenSet.tokenType?.trim(),
      scope: tokenSet.scope?.trim()
    };
  }
}
