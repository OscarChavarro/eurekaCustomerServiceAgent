export interface EmbeddingGeneratorPort {
  generateEmbeddings(inputs: string[]): Promise<number[][]>;
  getDimensions(): number;
}
