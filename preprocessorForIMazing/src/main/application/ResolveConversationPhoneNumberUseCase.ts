import { CsvRecord } from '../domain/Conversation';

export type ResolveConversationPhoneNumberCommand = {
  records: CsvRecord[];
  conversationName: string;
};

export interface ResolveConversationPhoneNumberStrategy {
  resolve(command: ResolveConversationPhoneNumberCommand): Promise<string | null>;
}

export class ResolveConversationPhoneNumberUseCase {
  constructor(private readonly strategies: ResolveConversationPhoneNumberStrategy[]) {}

  async execute(command: ResolveConversationPhoneNumberCommand): Promise<string | null> {
    for (const strategy of this.strategies) {
      const phoneNumber = await strategy.resolve(command);
      if (phoneNumber !== null) {
        return phoneNumber;
      }
    }

    return null;
  }
}
