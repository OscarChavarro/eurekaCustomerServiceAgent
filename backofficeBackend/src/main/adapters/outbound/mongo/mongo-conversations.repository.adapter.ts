import { Injectable } from '@nestjs/common';
import type { ConversationsReadRepositoryPort } from '../../../application/ports/outbound/conversations-read-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoConversationDocument = {
  _id: string;
  [key: string]: unknown;
};

@Injectable()
export class MongoConversationsRepositoryAdapter implements ConversationsReadRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async getConversationIds(): Promise<string[]> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const documents = await collection
      .find(
        {},
        {
          projection: { _id: 1 }
        }
      )
      .toArray();

    return documents.map((document) => String(document._id));
  }

  public async getConversationById(conversationId: string): Promise<Record<string, unknown> | null> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const document = await collection.findOne({ _id: conversationId });

    return document ? (document as Record<string, unknown>) : null;
  }
}
