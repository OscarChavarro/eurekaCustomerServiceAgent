import { Injectable } from '@nestjs/common';
import type {
  EmbeddingRepositoryRecord,
  EmbeddingsRepositoryPort
} from '../../../application/ports/outbound/embeddings-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoEmbeddingDocument = {
  _id: string;
  conversationId: string;
  chunkIndex: number;
  chunkId: string;
  text: string;
  vector: number[];
  createdAt: Date;
};

@Injectable()
export class MongoEmbeddingsRepositoryAdapter implements EmbeddingsRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async upsertEmbeddings(records: EmbeddingRepositoryRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    const collection =
      await this.mongoClientProvider.getEmbeddingsCollection<MongoEmbeddingDocument>();

    await collection.bulkWrite(
      records.map((record) => ({
        replaceOne: {
          filter: { _id: record.embeddingId },
          replacement: {
            _id: record.embeddingId,
            conversationId: record.conversationId,
            chunkIndex: record.chunkIndex,
            chunkId: record.chunkId,
            text: record.text,
            vector: record.vector,
            createdAt: record.createdAt
          },
          upsert: true
        }
      })),
      { ordered: true }
    );
  }
}
