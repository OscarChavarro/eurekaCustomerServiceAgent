import { Injectable, inject } from '@angular/core';

import type { BackendConversationDocument } from '../../../core/api/services/conversations-api.service';
import type { ConversationStageRenderer } from './conversation-stage-renderer.interface';
import type { ChatMessage } from './conversation-view.types';
import { ChunkConversationStageRenderer } from './chunk-conversation-stage.renderer';

@Injectable({ providedIn: 'root' })
export class EmbedConversationStageRenderer implements ConversationStageRenderer {
  readonly mode = 'embed' as const;
  private readonly chunkConversationStageRenderer = inject(ChunkConversationStageRenderer);

  render(document: BackendConversationDocument): ChatMessage[] {
    return this.chunkConversationStageRenderer.render(document);
  }
}
