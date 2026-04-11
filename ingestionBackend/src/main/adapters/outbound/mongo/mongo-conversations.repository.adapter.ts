import { Injectable } from '@nestjs/common';
import type {
  ChunkedConversationStageMessage,
  CleanedConversationStageMessage,
  ConversationMetadata,
  ConversationsRepositoryPort,
  RawConversationAudioDetails,
  RawConversationAudioMessage,
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

type RawAudioMessageProjection = {
  conversationId: string;
  conversationFilePattern: string | null;
  conversationContactName: string | null;
  rawMessageExternalId: string;
  rawMessageSentAt: string | null;
  normalizedFields: Record<string, unknown>;
  audioDetails?: RawConversationAudioDetails;
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

  public async updateConversationFilePattern(
    conversationId: string,
    filePattern: string
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          filePattern
        }
      }
    );
  }

  public async findRawMessagesWithAudioAttachment(): Promise<RawConversationAudioMessage[]> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const audioAttachmentRegex = /\.(opus|mp3|m2a|m4a)$/i;

    const rawAudioMessages = await collection
      .aggregate<RawAudioMessageProjection>([
        {
          $match: {
            rawMessages: {
              $elemMatch: {
                'normalizedFields.attachment': {
                  $type: 'string',
                  $regex: audioAttachmentRegex
                }
              }
            }
          }
        },
        {
          $unwind: '$rawMessages'
        },
        {
          $match: {
            'rawMessages.normalizedFields.attachment': {
              $type: 'string',
              $regex: audioAttachmentRegex
            }
          }
        },
        {
          $project: {
            _id: 0,
            conversationId: '$_id',
            conversationFilePattern: '$filePattern',
            conversationContactName: '$contactName',
            rawMessageExternalId: '$rawMessages.externalId',
            rawMessageSentAt: '$rawMessages.sentAt',
            normalizedFields: '$rawMessages.normalizedFields',
            audioDetails: '$rawMessages.audioDetails'
          }
        }
      ])
      .toArray();

    return rawAudioMessages.map((message) => ({
      conversationId: message.conversationId,
      conversationFilePattern:
        typeof message.conversationFilePattern === 'string'
          ? message.conversationFilePattern
          : null,
      conversationContactName:
        typeof message.conversationContactName === 'string'
          ? message.conversationContactName
          : null,
      rawMessageExternalId: message.rawMessageExternalId,
      rawMessageSentAt: message.rawMessageSentAt,
      normalizedFields: message.normalizedFields,
      audioDetails: message.audioDetails
    }));
  }

  public async deleteAllConversations(): Promise<number> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();
    const result = await collection.deleteMany({});
    return result.deletedCount ?? 0;
  }
}
