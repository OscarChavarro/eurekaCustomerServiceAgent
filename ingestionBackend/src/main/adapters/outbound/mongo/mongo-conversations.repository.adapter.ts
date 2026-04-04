import { Injectable } from '@nestjs/common';
import type {
  ChunkedConversationStageMessage,
  CleanedConversationStageMessage,
  ConversationMetadata,
  ConversationsRepositoryPort,
  RawConversationStageMessage,
  StructuredConversationStageMessage
} from '../../../application/ports/outbound/conversations-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoConversationDocument = {
  _id: string;
  rawMessages: RawConversationStageMessage[];
  cleanedMessages: CleanedConversationStageMessage[];
  structuredMessages: StructuredConversationStageMessage[];
  chunkedMessages: ChunkedConversationStageMessage[];
  metadata: {
    createdAt: Date;
    source: string;
  };
};

@Injectable()
export class MongoConversationsRepositoryAdapter implements ConversationsRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async upsertRawMessages(
    conversationId: string,
    rawMessages: RawConversationStageMessage[],
    metadata: ConversationMetadata
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          rawMessages,
          'metadata.source': metadata.source
        },
        $setOnInsert: {
          cleanedMessages: [],
          structuredMessages: [],
          chunkedMessages: [],
          'metadata.createdAt': metadata.createdAt
        }
      },
      { upsert: true }
    );
  }

  public async upsertCleanedMessages(
    conversationId: string,
    cleanedMessages: CleanedConversationStageMessage[]
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          cleanedMessages
        },
        $setOnInsert: {
          rawMessages: [],
          structuredMessages: [],
          chunkedMessages: [],
          metadata: {
            createdAt: new Date(),
            source: 'unknown'
          }
        }
      },
      { upsert: true }
    );
  }

  public async upsertStructuredMessages(
    conversationId: string,
    structuredMessages: StructuredConversationStageMessage[]
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          structuredMessages
        },
        $setOnInsert: {
          rawMessages: [],
          cleanedMessages: [],
          chunkedMessages: [],
          metadata: {
            createdAt: new Date(),
            source: 'unknown'
          }
        }
      },
      { upsert: true }
    );
  }

  public async upsertChunkedMessages(
    conversationId: string,
    chunkedMessages: ChunkedConversationStageMessage[]
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          chunkedMessages
        },
        $setOnInsert: {
          rawMessages: [],
          cleanedMessages: [],
          structuredMessages: [],
          metadata: {
            createdAt: new Date(),
            source: 'unknown'
          }
        }
      },
      { upsert: true }
    );
  }
}
