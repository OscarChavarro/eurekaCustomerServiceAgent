import { Injectable } from '@nestjs/common';
import type { ConversationDeletionRepositoryPort } from '../../../application/ports/outbound/conversation-deletion-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoConversationDocument = {
  _id: string;
  sourceFile?: unknown;
};

type MongoEmbeddingDocument = {
  _id: string;
  conversationId?: unknown;
};

@Injectable()
export class MongoConversationDeletionRepositoryAdapter implements ConversationDeletionRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async getConversationSourceFilePath(conversationId: string): Promise<string | null> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const document = await collection.findOne(
      { _id: conversationId },
      {
        projection: { _id: 1, sourceFile: 1 }
      }
    );

    return typeof document?.sourceFile === 'string' ? document.sourceFile : null;
  }

  public async deleteEmbeddingsByConversationId(conversationId: string): Promise<number> {
    const collection =
      await this.mongoClientProvider.getEmbeddingsCollection<MongoEmbeddingDocument>();

    const result = await collection.deleteMany({ conversationId });
    return result.deletedCount ?? 0;
  }

  public async deleteConversationById(conversationId: string): Promise<boolean> {
    const collection =
      await this.mongoClientProvider.getConversationsCollection<MongoConversationDocument>();

    const result = await collection.deleteOne({ _id: conversationId });
    return (result.deletedCount ?? 0) > 0;
  }
}
