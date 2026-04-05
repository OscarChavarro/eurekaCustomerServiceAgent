import { Inject, Injectable } from '@nestjs/common';
import type {
  ConversationCsvArchivePort
} from '../../ports/outbound/conversation-csv-archive.port';
import type { ConversationDeletionRepositoryPort } from '../../ports/outbound/conversation-deletion-repository.port';
import { TOKENS } from '../../ports/tokens';
import type { DeleteConversationCommand, DeleteConversationResult } from './delete-conversation.types';

@Injectable()
export class DeleteConversationUseCase {
  constructor(
    @Inject(TOKENS.ConversationDeletionRepositoryPort)
    private readonly conversationDeletionRepositoryPort: ConversationDeletionRepositoryPort,
    @Inject(TOKENS.ConversationCsvArchivePort)
    private readonly conversationCsvArchivePort: ConversationCsvArchivePort
  ) {}

  public async execute(command: DeleteConversationCommand): Promise<DeleteConversationResult> {
    const candidateConversationIds = this.buildCandidateConversationIds(command.conversationId);
    const sourceFileLookupResult = await this.findSourceFilePath(candidateConversationIds);

    const csvArchiveResult = await this.conversationCsvArchivePort.moveToDisabledFolderIfCsv(
      sourceFileLookupResult.sourceFilePath
    );
    const embeddingsDeleted = await this.deleteEmbeddings(candidateConversationIds);
    const conversationDeleted = await this.deleteConversation(candidateConversationIds);

    return {
      ok: true,
      conversationId: sourceFileLookupResult.matchedConversationId ?? candidateConversationIds[0] ?? command.conversationId,
      csvMoved: csvArchiveResult.moved,
      csvFromPath: csvArchiveResult.fromPath,
      csvToPath: csvArchiveResult.toPath,
      embeddingsDeleted,
      conversationDeleted
    };
  }

  private buildCandidateConversationIds(conversationId: string): string[] {
    const trimmedConversationId = conversationId.trim();
    const prefix = 'WhatsApp - ';

    if (!trimmedConversationId) {
      return [];
    }

    const withoutPrefix = trimmedConversationId.startsWith(prefix)
      ? trimmedConversationId.slice(prefix.length).trim()
      : trimmedConversationId;
    const withPrefix = `${prefix}${withoutPrefix}`;

    return [...new Set([trimmedConversationId, withPrefix, withoutPrefix].filter(Boolean))];
  }

  private async findSourceFilePath(candidateConversationIds: string[]): Promise<{
    matchedConversationId: string | null;
    sourceFilePath: string | null;
  }> {
    for (const candidateConversationId of candidateConversationIds) {
      const sourceFilePath =
        await this.conversationDeletionRepositoryPort.getConversationSourceFilePath(candidateConversationId);

      if (sourceFilePath) {
        return {
          matchedConversationId: candidateConversationId,
          sourceFilePath
        };
      }
    }

    return {
      matchedConversationId: null,
      sourceFilePath: null
    };
  }

  private async deleteEmbeddings(candidateConversationIds: string[]): Promise<number> {
    let deletedCount = 0;

    for (const candidateConversationId of candidateConversationIds) {
      deletedCount +=
        await this.conversationDeletionRepositoryPort.deleteEmbeddingsByConversationId(candidateConversationId);
    }

    return deletedCount;
  }

  private async deleteConversation(candidateConversationIds: string[]): Promise<boolean> {
    for (const candidateConversationId of candidateConversationIds) {
      const deleted = await this.conversationDeletionRepositoryPort.deleteConversationById(
        candidateConversationId
      );

      if (deleted) {
        return true;
      }
    }

    return false;
  }
}
