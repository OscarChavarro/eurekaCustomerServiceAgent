import {
  ResolveConversationPhoneNumberCommand,
  ResolveConversationPhoneNumberStrategy
} from '../ResolveConversationPhoneNumberUseCase';

export class ResolvePhoneFromNumericConversationNameStrategy implements ResolveConversationPhoneNumberStrategy {
  async resolve(command: ResolveConversationPhoneNumberCommand): Promise<string | null> {
    const trimmedConversationName = command.conversationName.trim();
    if (!/^[\d\s()+]+$/.test(trimmedConversationName)) {
      return null;
    }

    const digitsOnly = trimmedConversationName.replace(/\D/g, '');
    return digitsOnly.length > 0 ? digitsOnly : null;
  }
}
