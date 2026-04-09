import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodError } from 'zod';
import { secretsSettingsSchema } from './secrets-settings.schema';
import type { SecretsSettings } from './secrets-settings.type';

@Injectable()
export class SecretsConfig {
  private readonly settings: SecretsSettings;

  constructor() {
    this.settings = this.loadSecretsSettings();
  }

  public get values(): SecretsSettings {
    return this.settings;
  }

  private loadSecretsSettings(): SecretsSettings {
    const secretsPath = join(process.cwd(), 'secrets.json');

    if (!existsSync(secretsPath)) {
      throw new Error(`secrets.json not found at ${secretsPath}. Create it from secrets-example.json.`);
    }

    const rawFile = readFileSync(secretsPath, 'utf-8');
    const parsed = this.parseJson(rawFile, secretsPath);
    const validationResult = secretsSettingsSchema.safeParse(parsed);

    if (!validationResult.success) {
      throw new Error(this.buildValidationErrorMessage(secretsPath, validationResult.error));
    }

    return validationResult.data;
  }

  private parseJson(rawFile: string, secretsPath: string): unknown {
    try {
      return JSON.parse(rawFile) as unknown;
    } catch {
      throw new Error(`Invalid JSON in ${secretsPath}.`);
    }
  }

  private buildValidationErrorMessage(secretsPath: string, error: ZodError): string {
    const details = error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');

    return `Invalid configuration in ${secretsPath}. ${details}`;
  }
}
