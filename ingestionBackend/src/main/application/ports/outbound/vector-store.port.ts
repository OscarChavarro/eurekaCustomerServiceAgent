export interface VectorPoint {
  readonly id: string;
  readonly vector: number[];
  readonly payload: Record<string, unknown>;
}

export interface VectorStorePort {
  clearCollection(): Promise<void>;
  deletePointsByConversationId(conversationId: string): Promise<void>;
  ensureCollection(dimension: number): Promise<void>;
  upsert(points: VectorPoint[]): Promise<void>;
}
