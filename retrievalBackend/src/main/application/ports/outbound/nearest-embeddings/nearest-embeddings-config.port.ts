export type EmbeddingProviderConfig = {
  provider: string;
  host: string;
  port: number;
};

export type QdrantSearchConfig = {
  url: string;
  apiKey?: string;
  collectionName: string;
};

export interface NearestEmbeddingsConfigPort {
  getEmbeddingProviderConfig(): EmbeddingProviderConfig;
  getQdrantSearchConfig(): QdrantSearchConfig;
}
