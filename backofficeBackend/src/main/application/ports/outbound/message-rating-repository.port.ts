export type RevisionStage = 'raw' | 'clean' | 'structure' | 'chunk';
export type RevisionRatingValue = 'warning' | 'good' | 'bad';
export type RevisionMutationValue = RevisionRatingValue | 'cleared';

export type SaveRevisionCommand = {
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: RevisionMutationValue;
  ratedAt: Date;
};

export type StoredRevision = {
  conversationId: string;
  stage: RevisionStage;
  stageId: string;
  rating: RevisionRatingValue;
  ratedAt: Date;
};

export interface MessageRatingRepositoryPort {
  save(command: SaveRevisionCommand): Promise<void>;
  findByConversationId(conversationId: string): Promise<StoredRevision[]>;
}
