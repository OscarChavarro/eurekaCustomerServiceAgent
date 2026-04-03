import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  SemanticConversationChunk,
  StructuredConversationTurn
} from './kwoledge-ingestion-message.model';

@Injectable()
export class ConversationChunkingService {
  public buildSemanticChunks(structuredTurns: StructuredConversationTurn[]): SemanticConversationChunk[] {
    const chunks: SemanticConversationChunk[] = [];

    for (const turn of structuredTurns) {
      const content = this.buildChunkContent(turn);

      if (!content) {
        continue;
      }

      const chunkId = this.buildChunkId(turn.turnId, content);

      chunks.push(
        new SemanticConversationChunk(
          chunkId,
          turn.turnId,
          turn.conversationId,
          turn.sourceFile,
          content,
          {
            startedAt: turn.startedAt?.toISOString() ?? null,
            endedAt: turn.endedAt?.toISOString() ?? null,
            messageIds: turn.messageIds
          }
        )
      );
    }

    return chunks;
  }

  private buildChunkContent(turn: StructuredConversationTurn): string {
    const customerLine = turn.customerMessage ? `Customer: ${turn.customerMessage}` : '';
    const agentLine = turn.agentMessage ? `Agent: ${turn.agentMessage}` : '';

    return [customerLine, agentLine].filter((line) => line.length > 0).join('\n').trim();
  }

  private buildChunkId(turnId: string, content: string): string {
    return createHash('sha256').update(`${turnId}|${content}`).digest('hex');
  }
}
