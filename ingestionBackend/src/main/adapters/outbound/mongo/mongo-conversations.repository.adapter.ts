import { Injectable } from '@nestjs/common';
import type {
  ChunkedConversationStageMessage,
  CleanedConversationStageMessage,
  ConversationMetadata,
  ConversationsRepositoryPort,
  NormalizedConversationStageMessage,
  RawConversationAudioDetails,
  RawMessageAudioNormalizedFieldsPatch,
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
  containsAudio?: boolean;
  containsPhotos?: boolean;
  firstMessageDate: string | null;
  lastMessageDate: string | null;
  lastMessageText: string | null;
  rawMessages: RawConversationStageMessage[];
  normalizedMessages: NormalizedConversationStageMessage[];
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
          containsPhotos: rawMessages.some((rawMessage) => this.rawMessageContainsPhoto(rawMessage)),
          firstMessageDate: metadata.firstMessageDate,
          lastMessageDate: metadata.lastMessageDate,
          lastMessageText: metadata.lastMessageText,
          'metadata.source': metadata.source
        },
        $setOnInsert: {
          normalizedMessages: [],
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
          normalizedMessages: [],
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

  public async upsertNormalizedMessages(
    conversationId: string,
    normalizedMessages: NormalizedConversationStageMessage[]
  ): Promise<void> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          normalizedMessages
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
          normalizedMessages: [],
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
          normalizedMessages: [],
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
    await collection.updateOne(
      {
        _id: conversationId,
        'normalizedMessages.externalId': rawMessageExternalId
      },
      {
        $set: {
          'normalizedMessages.$.audioDetails': audioDetails
        }
      }
    );

    if (audioDetails.type === 'voice') {
      await collection.updateOne(
        { _id: conversationId },
        {
          $set: {
            containsAudio: true
          }
        }
      );
    }
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

  public async updateRawMessageAudioNormalizedFields(
    conversationId: string,
    rawMessageExternalId: string,
    patch: RawMessageAudioNormalizedFieldsPatch
  ): Promise<void> {
    const setPatchEntries = Object.entries(patch).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0
    );
    if (setPatchEntries.length === 0) {
      return;
    }

    const rawMessageSetPayload: Record<string, string> = {};
    const normalizedMessageSetPayload: Record<string, string> = {};

    for (const [fieldName, fieldValue] of setPatchEntries) {
      rawMessageSetPayload[`rawMessages.$.normalizedFields.${fieldName}`] = fieldValue;
      normalizedMessageSetPayload[`normalizedMessages.$.normalizedFields.${fieldName}`] = fieldValue;
    }

    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    await collection.updateOne(
      {
        _id: conversationId,
        'rawMessages.externalId': rawMessageExternalId
      },
      {
        $set: rawMessageSetPayload
      }
    );

    await collection.updateOne(
      {
        _id: conversationId,
        'normalizedMessages.externalId': rawMessageExternalId
      },
      {
        $set: normalizedMessageSetPayload
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
          $addFields: {
            normalizedMessages: { $ifNull: ['$normalizedMessages', []] },
            rawMessages: { $ifNull: ['$rawMessages', []] }
          }
        },
        {
          $addFields: {
            audioSourceMessages: {
              $cond: [
                { $gt: [{ $size: '$normalizedMessages' }, 0] },
                '$normalizedMessages',
                '$rawMessages'
              ]
            }
          }
        },
        {
          $match: {
            audioSourceMessages: {
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
          $unwind: '$audioSourceMessages'
        },
        {
          $match: {
            'audioSourceMessages.normalizedFields.attachment': {
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
            rawMessageExternalId: '$audioSourceMessages.externalId',
            rawMessageSentAt: '$audioSourceMessages.sentAt',
            normalizedFields: '$audioSourceMessages.normalizedFields',
            audioDetails: '$audioSourceMessages.audioDetails'
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

  public async findRawMessagesWithAudioAttachmentFromConversationsWithAudioDetails(): Promise<
    RawConversationAudioMessage[]
  > {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const audioAttachmentRegex = /\.(opus|mp3|m2a|m4a)$/i;

    const rawAudioMessages = await collection
      .aggregate<RawAudioMessageProjection>([
        {
          $match: {
            rawMessages: {
              $elemMatch: {
                audioDetails: {
                  $exists: true,
                  $ne: null
                }
              }
            }
          }
        },
        {
          $addFields: {
            rawMessages: { $ifNull: ['$rawMessages', []] }
          }
        },
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

  private rawMessageContainsPhoto(rawMessage: RawConversationStageMessage): boolean {
    const attachment = this.toNonEmptyString(rawMessage.normalizedFields.attachment);
    if (attachment && this.isImageAttachment(attachment)) {
      return true;
    }

    const attachmentType = this.toNonEmptyString(rawMessage.normalizedFields.attachmentType);
    if (!attachmentType) {
      return false;
    }

    const normalizedAttachmentType = attachmentType.trim().toLowerCase();
    return normalizedAttachmentType.includes('image') ||
      normalizedAttachmentType.includes('imagen') ||
      normalizedAttachmentType.includes('photo') ||
      normalizedAttachmentType.includes('foto');
  }

  private isImageAttachment(attachment: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|tif|tiff)$/i.test(attachment.trim());
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
