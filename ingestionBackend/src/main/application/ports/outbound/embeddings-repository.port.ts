export type EmbeddingRepositoryRecord = {
  embeddingId: string;
  conversationId: string;
  chunkIndex: number;
  chunkId: string;
  text: string;
  vector: number[];
  createdAt: Date;
};

export interface EmbeddingsRepositoryPort {
  upsertEmbeddings(records: EmbeddingRepositoryRecord[]): Promise<void>;
}
