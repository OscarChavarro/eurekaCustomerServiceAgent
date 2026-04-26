import { Injectable } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { ServiceConfig } from '../../config/service.config';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class MongoConnectivityStartupValidator implements StartupValidator {
  constructor(private readonly serviceConfig: ServiceConfig) {}

  public getName(): string {
    return 'MongoConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'MongoDB connection check succeeded.';
  }

  public async validate(): Promise<void> {
    const mongoConfig = this.serviceConfig.mongoConfig;
    const mongoUrl = this.buildMongoUrl();
    const mongoClient = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5_000
    });

    try {
      await mongoClient.connect();
      const database = mongoClient.db(mongoConfig.database);
      await database.command({ ping: 1 });
    } catch (error) {
      throw new Error(`Dependency MongoDB failed: ${String(error)}`);
    } finally {
      await mongoClient.close();
    }
  }

  private buildMongoUrl(): string {
    const mongoConfig = this.serviceConfig.mongoConfig;
    const username = encodeURIComponent(mongoConfig.username);
    const password = encodeURIComponent(mongoConfig.password);
    const host = mongoConfig.host;
    const port = mongoConfig.port;
    const database = encodeURIComponent(mongoConfig.database);

    return `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=${database}`;
  }
}
