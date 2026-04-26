import type { ConversationStage } from '../../domain/conversation-stage/conversation-stage.types';

export interface ConversationStageRepositoryPort {
  findByConversationId(conversationId: string): Promise<ConversationStage | null>;
  upsert(stage: ConversationStage): Promise<void>;
}
