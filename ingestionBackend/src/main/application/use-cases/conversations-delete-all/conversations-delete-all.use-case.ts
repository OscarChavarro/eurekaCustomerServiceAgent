import { Inject, Injectable } from '@nestjs/common';
import type { ConversationsRepositoryPort } from '../../ports/outbound/conversations-repository.port';
import type { EmbeddingsRepositoryPort } from '../../ports/outbound/embeddings-repository.port';
import { TOKENS } from '../../ports/tokens';
import type { ConversationsDeleteAllResult } from './conversations-delete-all.result';

@Injectable()
export class ConversationsDeleteAllUseCase {
  constructor(
    @Inject(TOKENS.ConversationsRepositoryPort)
    private readonly conversationsRepositoryPort: ConversationsRepositoryPort,
    @Inject(TOKENS.EmbeddingsRepositoryPort)
    private readonly embeddingsRepositoryPort: EmbeddingsRepositoryPort
  ) {}

  public async execute(): Promise<ConversationsDeleteAllResult> {
    const [deletedConversations, deletedEmbeddings] = await Promise.all([
      this.conversationsRepositoryPort.deleteAllConversations(),
      this.embeddingsRepositoryPort.deleteAllEmbeddings()
    ]);

    return {
      deletedConversations,
      deletedEmbeddings
    };
  }
}

