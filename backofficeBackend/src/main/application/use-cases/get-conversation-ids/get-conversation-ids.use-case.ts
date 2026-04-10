import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '../../ports/tokens';
import type { GetConversationIdsUseCasePort } from '../../ports/inbound/get-conversation-ids.use-case.port';
import type { ConversationsReadRepositoryPort } from '../../ports/outbound/conversations-read-repository.port';
import type { GetConversationIdsResult } from './get-conversation-ids.result';

@Injectable()
export class GetConversationIdsUseCase implements GetConversationIdsUseCasePort {
  constructor(
    @Inject(TOKENS.ConversationsReadRepositoryPort)
    private readonly conversationsReadRepository: ConversationsReadRepositoryPort
  ) {}

  public async execute(): Promise<GetConversationIdsResult> {
    const summaries = await this.conversationsReadRepository.getConversationIds();

    return summaries.map((summary) => ({
      ...summary,
      contactName:
        typeof summary.contactName === 'string' && summary.contactName.trim().length > 0
          ? summary.contactName.trim()
          : null,
      filePattern:
        typeof summary.filePattern === 'string' && summary.filePattern.trim().length > 0
          ? summary.filePattern.trim()
          : null
    }));
  }
}
