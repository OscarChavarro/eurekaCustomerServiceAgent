export interface EmbeddingPort {
  embedText(text: string): Promise<number[]>;
}
