import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ContactFormatValidatorService {
  public isCompliant(contactName: string | null | undefined): boolean {
    if (typeof contactName !== 'string') {
      return false;
    }

    if (contactName.length === 0) {
      return false;
    }

    // Names must use exactly one ASCII space between words, with no leading/trailing spaces.
    if (!/^\S+( \S+)*$/u.test(contactName)) {
      return false;
    }
    const tokens = contactName.split(' ');

    let foundAlphanumeric = false;
    let previousNumericToken: string | null = null;

    for (const token of tokens) {
      const tokenType = this.resolveTokenType(token);
      if (tokenType === null) {
        return false;
      }

      if (tokenType === 'numeric') {
        if (foundAlphanumeric) {
          return false;
        }

        const normalizedNumericToken = this.normalizeNumericToken(token);
        if (
          previousNumericToken !== null &&
          this.compareNumericTokens(normalizedNumericToken, previousNumericToken) > 0
        ) {
          return false;
        }

        previousNumericToken = normalizedNumericToken;
        continue;
      }

      foundAlphanumeric = true;
    }

    return true;
  }

  private resolveTokenType(token: string): 'numeric' | 'alphanumeric' | null {
    if (/^\d+$/u.test(token)) {
      return 'numeric';
    }

    if (token.length > 0) {
      return 'alphanumeric';
    }

    return null;
  }

  private normalizeNumericToken(token: string): string {
    const normalized = token.replace(/^0+/u, '');
    return normalized.length > 0 ? normalized : '0';
  }

  private compareNumericTokens(left: string, right: string): number {
    if (left.length !== right.length) {
      return left.length > right.length ? 1 : -1;
    }

    if (left === right) {
      return 0;
    }

    return left > right ? 1 : -1;
  }
}
