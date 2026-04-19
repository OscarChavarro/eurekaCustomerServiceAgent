import { Injectable } from '@nestjs/common';
import type { ConversationsReadRepositoryPort } from '../../../application/ports/outbound/conversations-read-repository.port';
import type { ConversationSummaryResult } from '../../../application/use-cases/get-conversation-ids/get-conversation-ids.result';
import { MongoClientProvider } from './mongo-client.provider';

type MongoConversationDocument = {
  _id: string;
  contactName?: unknown;
  filePattern?: unknown;
  lastMessageText?: unknown;
  firstMessageDate?: unknown;
  lastMessageDate?: unknown;
  containsAudio?: unknown;
  containsPhotos?: unknown;
};

@Injectable()
export class MongoConversationsRepositoryAdapter implements ConversationsReadRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async getConversationIds(): Promise<ConversationSummaryResult[]> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const documents = await collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            contactName: 1,
            filePattern: 1,
            lastMessageText: 1,
            firstMessageDate: 1,
            lastMessageDate: 1,
            containsAudio: 1,
            containsPhotos: 1
          }
        }
      )
      .toArray();

    return documents.map((document) => ({
      id: String(document._id),
      contactName:
        typeof document.contactName === 'string' && document.contactName.trim().length > 0
          ? document.contactName.trim()
          : null,
      filePattern:
        typeof document.filePattern === 'string' && document.filePattern.trim().length > 0
          ? document.filePattern.trim()
          : null,
      msg: typeof document.lastMessageText === 'string' ? document.lastMessageText : null,
      firstMessageDate:
        typeof document.firstMessageDate === 'string' ? document.firstMessageDate : null,
      lastMessageDate:
        typeof document.lastMessageDate === 'string' ? document.lastMessageDate : null,
      containsAudio: document.containsAudio === true,
      containsPhotos: document.containsPhotos === true
    }));
  }

  public async getConversationById(conversationId: string): Promise<Record<string, unknown> | null> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const document = await collection.findOne({ _id: conversationId });

    return document ? (document as Record<string, unknown>) : null;
  }
}
