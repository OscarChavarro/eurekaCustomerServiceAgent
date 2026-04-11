import { Injectable } from '@nestjs/common';
import type {
  MessageRatingRepositoryPort,
  SaveRevisionCommand,
  StoredRevision
} from '../../../application/ports/outbound/message-rating-repository.port';
import { MongoClientProvider } from './mongo-client.provider';

type MongoMessageRatingDocument = {
  _id: string;
  conversationId: string;
  stage: 'raw' | 'clean' | 'normalize' | 'structure' | 'chunk';
  stageId: string;
  rating: 'warning' | 'good' | 'bad';
  ratedAt: Date;
};

@Injectable()
export class MongoMessageRatingRepositoryAdapter implements MessageRatingRepositoryPort {
  constructor(private readonly mongoClientProvider: MongoClientProvider) {}

  public async save(command: SaveRevisionCommand): Promise<void> {
    const collection =
      await this.mongoClientProvider.getRevisionsCollection<MongoMessageRatingDocument>();
    const ratingId = `${command.conversationId}|${command.stage}|${command.stageId}`;

    if (command.rating === 'cleared') {
      await collection.deleteOne({ _id: ratingId });
      return;
    }

    await collection.updateOne(
      { _id: ratingId },
      {
        $set: {
          conversationId: command.conversationId,
          stage: command.stage,
          stageId: command.stageId,
          rating: command.rating,
          ratedAt: command.ratedAt
        }
      },
      { upsert: true }
    );
  }

  public async findByConversationId(conversationId: string): Promise<StoredRevision[]> {
    const collection =
      await this.mongoClientProvider.getRevisionsCollection<MongoMessageRatingDocument>();
    const documents = await collection.find({ conversationId }).toArray();

    return documents.map((document) => ({
      conversationId: document.conversationId,
      stage: document.stage,
      stageId: document.stageId,
      rating: document.rating,
      ratedAt: document.ratedAt
    }));
  }
}
