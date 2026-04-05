import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Collection, Db, MongoClient } from 'mongodb';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class MongoClientProvider implements OnApplicationShutdown {
  private client: MongoClient | null = null;
  private database: Db | null = null;
  private connectionPromise: Promise<Db> | null = null;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async getConversationsCollection<TDocument extends object>(): Promise<Collection<TDocument>> {
    const database = await this.getDatabase();
    return database.collection<TDocument>('conversations');
  }

  public async getRevisionsCollection<TDocument extends object>(): Promise<Collection<TDocument>> {
    const database = await this.getDatabase();
    return database.collection<TDocument>('revisions');
  }

  public async getEmbeddingsCollection<TDocument extends object>(): Promise<Collection<TDocument>> {
    const database = await this.getDatabase();
    return database.collection<TDocument>('embeddings');
  }

  public async ping(): Promise<void> {
    const database = await this.getDatabase();
    await database.command({ ping: 1 });
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  private async getDatabase(): Promise<Db> {
    if (this.database) {
      return this.database;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }

    return this.connectionPromise;
  }

  private async connect(): Promise<Db> {
    const mongoUrl = this.buildMongoUrl();
    const mongoConfig = this.serviceConfig.mongoConfig;
    const mongoClient = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5_000
    });

    await mongoClient.connect();
    const database = mongoClient.db(mongoConfig.database);

    this.client = mongoClient;
    this.database = database;

    return database;
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
