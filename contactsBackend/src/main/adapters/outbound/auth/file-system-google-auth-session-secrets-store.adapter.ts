import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GoogleAuthSessionSecretsStorePort } from '../../../application/ports/outbound/auth/google-auth-session-secrets-store.port';
import type { GoogleTokenSet } from '../../../application/ports/outbound/auth/google-auth-session-store.port';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class FileSystemGoogleAuthSessionSecretsStoreAdapter implements GoogleAuthSessionSecretsStorePort {
  private static readonly SECRETS_FILE_NAME = 'secrets.json';

  public async saveTokenSet(tokenSet: GoogleTokenSet): Promise<void> {
    const secretsPath = resolve(process.cwd(), FileSystemGoogleAuthSessionSecretsStoreAdapter.SECRETS_FILE_NAME);

    if (!existsSync(secretsPath)) {
      throw new Error(`secrets.json not found at ${secretsPath}.`);
    }

    const raw = readFileSync(secretsPath, 'utf-8');
    const parsed = this.parseJson(raw, secretsPath);
    const existingGoogleAuthSession = this.readExistingGoogleAuthSession(parsed);

    const normalizedTokenSet: GoogleTokenSet = {
      accessToken: tokenSet.accessToken.trim(),
      ...(typeof tokenSet.refreshToken === 'string' && tokenSet.refreshToken.trim().length > 0
        ? { refreshToken: tokenSet.refreshToken.trim() }
        : {}),
      ...(typeof tokenSet.expiryDateMs === 'number' ? { expiryDateMs: tokenSet.expiryDateMs } : {}),
      ...(typeof tokenSet.tokenType === 'string' && tokenSet.tokenType.trim().length > 0
        ? { tokenType: tokenSet.tokenType.trim() }
        : {}),
      ...(typeof tokenSet.scope === 'string' && tokenSet.scope.trim().length > 0
        ? { scope: tokenSet.scope.trim() }
        : {})
    };

    const updated: JsonRecord = {
      ...parsed,
      googleAuthSession: {
        ...(existingGoogleAuthSession ?? {}),
        tokenSet: normalizedTokenSet
      }
    };

    writeFileSync(secretsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8');
  }

  private parseJson(raw: string, secretsPath: string): JsonRecord {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Invalid JSON root in ${secretsPath}. Expected an object.`);
      }

      return parsed as JsonRecord;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`Invalid JSON in ${secretsPath}.`);
    }
  }

  private readExistingGoogleAuthSession(parsedSecrets: JsonRecord): JsonRecord | null {
    const candidate = parsedSecrets['googleAuthSession'];

    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    return candidate as JsonRecord;
  }
}
