import { Injectable } from '@nestjs/common';
import { SecretsConfig } from './settings/secrets.config';
import { SettingsConfig } from './settings/settings.config';

export type MongoConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
};

@Injectable()
export class ServiceConfig {
  constructor(
    private readonly settingsConfig: SettingsConfig,
    private readonly secretsConfig: SecretsConfig
  ) {}

  public get port(): number {
    return this.readPositiveInt('PORT', this.settingsConfig.values.api.httpPort);
  }

  public get mongoConnectionFailurePauseMs(): number {
    return this.readPositiveInt('MONGO_CONNECTION_FAILURE_PAUSE_MINUTES', 15) * 60_000;
  }

  public get mongoConfig(): MongoConfig {
    const host = process.env.MONGO_HOST?.trim() || this.secretsConfig.values.mongo.host;
    const port = this.readPositiveInt('MONGO_PORT', this.secretsConfig.values.mongo.port);
    const database = process.env.MONGO_DATABASE?.trim() || this.secretsConfig.values.mongo.database;
    const username = process.env.MONGO_USERNAME?.trim() || this.secretsConfig.values.mongo.username;
    const password = process.env.MONGO_PASSWORD?.trim() || this.secretsConfig.values.mongo.password;

    return {
      host,
      port,
      database,
      username,
      password
    };
  }

  private readPositiveInt(name: string, fallback: number): number {
    const rawValue = process.env[name];

    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
  }
}
