export type CanonicalPhoneNumber = {
  normalizedValue: string;
  digitsOnly: string;
  hasCountryCode: boolean;
};

export function normalizeConversationSourceId(conversationId: string): string {
  return conversationId
    .trim()
    .replace(/^whatsapp\s*-\s*/i, '')
    .replace(/\.csv$/i, '')
    .trim();
}

export function canonicalizePhoneNumber(rawPhone: string): CanonicalPhoneNumber | null {
  if (typeof rawPhone !== 'string') {
    return null;
  }

  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return null;
  }

  const withNormalizedSeparators = trimmed
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[-‐‑‒–—―]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const plainDigits = withNormalizedSeparators.replace(/\D+/g, '');
  if (!plainDigits) {
    return null;
  }

  const firstDigitIndex = withNormalizedSeparators.search(/\d/);
  const firstPlusIndex = withNormalizedSeparators.indexOf('+');
  const hasExplicitCountryCode = firstPlusIndex >= 0 && firstPlusIndex < firstDigitIndex;
  const hasSpainLocalFormat =
    !hasExplicitCountryCode &&
    plainDigits.length === 9 &&
    /^[6789]\d{8}$/.test(plainDigits);
  const hasCountryCode = hasExplicitCountryCode || hasSpainLocalFormat;
  const digitsOnly = hasSpainLocalFormat ? `34${plainDigits}` : plainDigits;

  return {
    normalizedValue: hasCountryCode ? `+${digitsOnly}` : digitsOnly,
    digitsOnly,
    hasCountryCode
  };
}

export function phonesMatchDigits(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (left.length < 7 || right.length < 7) {
    return false;
  }

  return left.endsWith(right) || right.endsWith(left);
}
