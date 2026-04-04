import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ChatMessage, ConversationViewMode } from './conversation-view.types';

export interface ConversationStageRenderer {
  readonly mode: ConversationViewMode;
  render(document: BackendConversationDocument): ChatMessage[];
}
