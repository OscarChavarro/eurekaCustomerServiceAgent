import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodError } from 'zod';
import { environmentSettingsSchema } from './environment-settings.schema';
import type { EnvironmentSettings } from './environment-settings.type';

@Injectable()
export class SettingsConfig {
  private readonly settings: EnvironmentSettings;

  constructor() {
    this.settings = this.loadEnvironmentSettings();
  }

  public get values(): EnvironmentSettings {
    return this.settings;
  }

  private loadEnvironmentSettings(): EnvironmentSettings {
    const sourcePath = join(
      process.cwd(),
      'src',
      'main',
      'infrastructure',
      'config',
      'settings',
      'environment.json'
    );
    const distPath = join(
      process.cwd(),
      'dist',
      'infrastructure',
      'config',
      'settings',
      'environment.json'
    );

    const configPath = existsSync(sourcePath) ? sourcePath : distPath;

    if (!existsSync(configPath)) {
      throw new Error(`environment.json not found. Expected at ${sourcePath} or ${distPath}.`);
    }

    const rawFile = readFileSync(configPath, 'utf-8');
    const parsed = this.parseJson(rawFile, configPath);
    const validationResult = environmentSettingsSchema.safeParse(parsed);

    if (!validationResult.success) {
      throw new Error(this.buildValidationErrorMessage(configPath, validationResult.error));
    }

    return validationResult.data;
  }

  private parseJson(rawFile: string, configPath: string): unknown {
    try {
      return JSON.parse(rawFile) as unknown;
    } catch {
      throw new Error(`Invalid JSON in ${configPath}.`);
    }
  }

  private buildValidationErrorMessage(configPath: string, error: ZodError): string {
    const details = error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');

    return `Invalid configuration in ${configPath}. ${details}`;
  }
}
