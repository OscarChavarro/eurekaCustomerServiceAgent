import { PhoneNumberExtractor } from '../../domain/PhoneNumberExtractor';
import {
  ResolveConversationPhoneNumberCommand,
  ResolveConversationPhoneNumberStrategy
} from '../ResolveConversationPhoneNumberUseCase';

export class ResolvePhoneFromIncomingMessageStrategy implements ResolveConversationPhoneNumberStrategy {
  constructor(private readonly phoneNumberExtractor: PhoneNumberExtractor) {}

  async resolve(command: ResolveConversationPhoneNumberCommand): Promise<string | null> {
    return this.phoneNumberExtractor.extract(command.records);
  }
}
