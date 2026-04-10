import { Injectable } from '@nestjs/common';
import type {
  ChunkedConversationStageMessage,
  CleanedConversationStageMessage,
  ConversationMetadata,
  ConversationsRepositoryPort,
  RawConversationAudioDetails,
  RawConversationStageMessage,
  StructuredConversationStageMessage
} from '../../../application/ports/outbound/conversations-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoConversationDocument = {
  _id: string;
  sourceFile: string;
  filePattern: string | null;
  contactName: string | null;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
  lastMessageText: string | null;
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
          sourceFile: metadata.source,
          filePattern: metadata.filePattern,
          contactName: metadata.contactName,
          rawMessages,
          firstMessageDate: metadata.firstMessageDate,
          lastMessageDate: metadata.lastMessageDate,
          lastMessageText: metadata.lastMessageText,
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
          sourceFile: 'unknown',
          filePattern: null,
          contactName: null,
          firstMessageDate: null,
          lastMessageDate: null,
          lastMessageText: null,
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
          sourceFile: 'unknown',
          filePattern: null,
          contactName: null,
          firstMessageDate: null,
          lastMessageDate: null,
          lastMessageText: null,
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
          sourceFile: 'unknown',
          filePattern: null,
          contactName: null,
          firstMessageDate: null,
          lastMessageDate: null,
          lastMessageText: null,
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

  public async upsertRawMessageAudioDetails(
    conversationId: string,
    rawMessageExternalId: string,
    audioDetails: RawConversationAudioDetails
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      {
        _id: conversationId,
        'rawMessages.externalId': rawMessageExternalId
      },
      {
        $set: {
          'rawMessages.$.audioDetails': audioDetails
        }
      }
    );
  }

  public async deleteAllConversations(): Promise<number> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();
    const result = await collection.deleteMany({});
    return result.deletedCount ?? 0;
  }
}
