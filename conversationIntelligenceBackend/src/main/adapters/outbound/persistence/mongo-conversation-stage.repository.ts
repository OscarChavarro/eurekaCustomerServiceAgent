import { Injectable } from '@nestjs/common';
import { MongoClient, type Collection } from 'mongodb';
import {
  ContactClassificationType,
  ConversationInconsistencyType,
  CustomerStage,
  type ConversationInconsistency,
  type ConversationStage,
  type PreviousConversationStage,
  type StageClassificationSource
} from '../../../domain/conversation-stage/conversation-stage.types';
import type { ConversationStageRepositoryPort } from '../../../ports/outbound/conversation-stage-repository.port';
import { ServiceConfig } from '../../../infrastructure/config/service.config';

@Injectable()
export class MongoConversationStageRepository implements ConversationStageRepositoryPort {
  private static readonly COLLECTION_NAME = 'conversationStages';
  private isIndexReady = false;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public async findByConversationId(conversationId: string): Promise<ConversationStage | null> {
    const client = this.createClient();

    try {
      await client.connect();
      const collection = this.getCollection(client);
      await this.ensureIndexes(collection);
      const document = await collection.findOne({ conversationId });

      if (!document) {
        return null;
      }

      return this.mapDocumentToDomain(document);
    } finally {
      await client.close();
    }
  }

  public async upsert(stage: ConversationStage): Promise<void> {
    const client = this.createClient();

    try {
      await client.connect();
      const collection = this.getCollection(client);
      await this.ensureIndexes(collection);
      await collection.updateOne(
        { conversationId: stage.conversationId },
        { $set: this.mapDomainToDocument(stage) },
        { upsert: true }
      );
    } finally {
      await client.close();
    }
  }

  private createClient(): MongoClient {
    return new MongoClient(this.buildMongoUrl(), {
      serverSelectionTimeoutMS: 5_000
    });
  }

  private getCollection(client: MongoClient): Collection<Record<string, unknown>> {
    const mongoConfig = this.serviceConfig.mongoConfig;
    return client.db(mongoConfig.database).collection<Record<string, unknown>>(MongoConversationStageRepository.COLLECTION_NAME);
  }

  private async ensureIndexes(collection: Collection<Record<string, unknown>>): Promise<void> {
    if (this.isIndexReady) {
      return;
    }

    await collection.createIndex({ conversationId: 1 }, { unique: true, name: 'conversation_id_unique' });
    this.isIndexReady = true;
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

  private mapDocumentToDomain(document: Record<string, unknown>): ConversationStage {
    const conversationId = this.readString(document['conversationId']) ?? 'unknown';
    const currentStage = this.readCustomerStage(document['currentStage']);

    return {
      conversationId,
      currentStage,
      previousStages: this.readPreviousStages(document['previousStages']),
      lastStageUpdate: this.readIsoString(document['lastStageUpdate']) ?? new Date(0).toISOString(),
      summary: this.readString(document['summary']) ?? 'No summary available.',
      detectedSignals: this.readStringArray(document['detectedSignals']),
      classificationSource: this.readClassificationSource(document['classificationSource']),
      inconsistencies: this.readInconsistencies(document['inconsistencies'])
    };
  }

  private mapDomainToDocument(stage: ConversationStage): ConversationStage {
    return {
      conversationId: stage.conversationId,
      currentStage: stage.currentStage,
      previousStages: stage.previousStages,
      lastStageUpdate: stage.lastStageUpdate,
      summary: stage.summary,
      detectedSignals: stage.detectedSignals,
      classificationSource: stage.classificationSource,
      inconsistencies: stage.inconsistencies
    };
  }

  private readPreviousStages(value: unknown): PreviousConversationStage[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const stage = this.readCustomerStage(record['stage']);
        const fromMessageId = this.readString(record['fromMessageId']) ?? 'unknown';
        const toMessageId = this.readString(record['toMessageId']) ?? fromMessageId;
        const startDate = this.readIsoString(record['startDate']) ?? new Date(0).toISOString();
        const endDate = this.readIsoString(record['endDate']) ?? startDate;

        return {
          stage,
          fromMessageId,
          toMessageId,
          startDate,
          endDate
        };
      })
      .filter((item): item is PreviousConversationStage => item !== null);
  }

  private readClassificationSource(value: unknown): StageClassificationSource {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { contactType: ContactClassificationType.UNKNOWN };
    }

    const record = value as Record<string, unknown>;
    const contactTypeRaw = this.readString(record['contactType']);
    const contactType = Object.values(ContactClassificationType).includes(contactTypeRaw as ContactClassificationType)
      ? (contactTypeRaw as ContactClassificationType)
      : ContactClassificationType.UNKNOWN;
    const externalId = this.readString(record['externalId']);

    return externalId ? { contactType, externalId } : { contactType };
  }

  private readInconsistencies(value: unknown): ConversationInconsistency[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const typeRaw = this.readString(record['type']);
        const type = Object.values(ConversationInconsistencyType).includes(typeRaw as ConversationInconsistencyType)
          ? (typeRaw as ConversationInconsistencyType)
          : null;
        const message = this.readString(record['message']);

        return type && message ? { type, message } : null;
      })
      .filter((item): item is ConversationInconsistency => item !== null);
  }

  private readCustomerStage(value: unknown): CustomerStage {
    const raw = this.readString(value);

    if (raw === 'UNDEFINED') {
      return CustomerStage.UNIDENTIFIED;
    }

    return Object.values(CustomerStage).includes(raw as CustomerStage)
      ? (raw as CustomerStage)
      : CustomerStage.UNIDENTIFIED;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private readIsoString(value: unknown): string | null {
    const raw = this.readString(value);
    if (!raw) {
      return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
