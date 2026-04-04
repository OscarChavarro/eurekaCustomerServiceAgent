import type { GetConversationIdsResult } from '../../use-cases/get-conversation-ids/get-conversation-ids.result';

export interface GetConversationIdsUseCasePort {
  execute(): Promise<GetConversationIdsResult>;
}
