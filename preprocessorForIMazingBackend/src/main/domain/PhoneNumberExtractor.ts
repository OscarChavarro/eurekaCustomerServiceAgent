import { CsvRecord } from './Conversation';

export class PhoneNumberExtractor {
  extract(records: CsvRecord[]): string | null {
    for (const record of records) {
      const type: string = (record.Type || '').trim().toLowerCase();
      if (type !== 'incoming') {
        continue;
      }

      const senderId: string = (record['Sender ID'] || '').trim();
      const phoneNumber: string = this.normalizePhoneNumber(senderId);
      if (phoneNumber.length > 0) {
        return phoneNumber;
      }
    }

    return null;
  }

  private normalizePhoneNumber(value: string): string {
    return value.replace(/\D/g, '');
  }
}
