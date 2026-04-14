import { Injectable } from '@nestjs/common';
import { basename, extname } from 'node:path';

@Injectable()
export class ImazingCsvFileNameService {
  private static readonly PREFIX_PATTERN = /^whatsapp\s*-\s*/i;
  private static readonly SPAIN_LOCAL_PHONE_PATTERN = /^\d{3}\s\d{2}\s\d{2}\s\d{2}$/;

  public extractConversationLabel(sourceFile: string): string {
    const rawBaseName = basename(sourceFile, extname(sourceFile));
    const withoutPrefix = rawBaseName.replace(ImazingCsvFileNameService.PREFIX_PATTERN, '');
    return withoutPrefix.trim();
  }

  public isPhoneLike(value: string): boolean {
    return this.normalizePhoneLabel(value) !== null;
  }

  public normalizePhoneLabel(value: string): string | null {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    if (/[\p{L}]/u.test(trimmed)) {
      return null;
    }

    const withNormalizedSeparators = trimmed
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/[-‐‑‒–—―]+/g, ' ')
      .replace(/[()]/g, ' ');
    const onlyDigitsAndPlusAndSpaces = withNormalizedSeparators
      .replace(/[^0-9+ ]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const hasPlusSign = onlyDigitsAndPlusAndSpaces.includes('+');
    const digitsOnly = onlyDigitsAndPlusAndSpaces.replace(/\D/g, '');

    if (digitsOnly.length === 0) {
      return null;
    }

    if (hasPlusSign) {
      return `+${digitsOnly}`;
    }

    if (ImazingCsvFileNameService.SPAIN_LOCAL_PHONE_PATTERN.test(onlyDigitsAndPlusAndSpaces)) {
      return `+34${digitsOnly}`;
    }

    if (/^\d+$/.test(onlyDigitsAndPlusAndSpaces)) {
      return digitsOnly;
    }

    return null;
  }

  public buildPhoneCsvFileName(phoneNumber: string): string {
    const normalizedPhone = this.normalizePhoneLabel(phoneNumber);

    if (!normalizedPhone) {
      throw new Error(`Invalid phone number for CSV rename: ${phoneNumber}`);
    }

    return `${normalizedPhone}.csv`;
  }
}
