import { CsvRecord } from './Conversation';

export class FacebookConfirmationConversationDetector {
  isFacebookConfirmationConversation(records: CsvRecord[]): boolean {
    for (const record of records) {
      const keys = Object.keys(record);
      for (const key of keys) {
        const value = record[key];
        if (this.isFacebookConfirmationMessage(value)) {
          return true;
        }
      }
    }

    return false;
  }

  private isFacebookConfirmationMessage(value: string): boolean {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return /\b\d+\s+es tu codigo de confirmacion de facebook\b/.test(normalized);
  }
}
