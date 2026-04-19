import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ConversationsApiService,
  type PhonePrefixLookupResponse
} from './conversations-api.service';

export type PhonePrefixAreaCacheEntry = {
  countryCode: string | null;
  countryName: string | null;
  dialCode: string;
  subzone: string | null;
  subzoneName: string | null;
};

type PhonePrefixAreaCacheStore = Record<string, PhonePrefixAreaCacheEntry>;

@Injectable({ providedIn: 'root' })
export class PhonePrefixCacheService {
  private static readonly STORAGE_KEY = 'phone-prefix-area-cache.v1';

  private readonly conversationsApiService = inject(ConversationsApiService);

  public async resolveCountryCode(phone: string): Promise<string | null> {
    const areaInfo = await this.resolveAreaInfo(phone);
    return areaInfo?.countryCode ?? null;
  }

  public resolveCountryCodeFromCache(phone: string): string | null {
    const areaInfo = this.resolveAreaInfoFromCache(phone);
    return areaInfo?.countryCode ?? null;
  }

  public resolveAreaInfoFromCache(phone: string): PhonePrefixAreaCacheEntry | null {
    const phoneDigits = this.normalizeDigits(phone);
    if (!phoneDigits) {
      return null;
    }

    return this.findByPhoneDigits(this.readStore(), phoneDigits);
  }

  public async resolveAreaInfo(phone: string): Promise<PhonePrefixAreaCacheEntry | null> {
    const phoneDigits = this.normalizeDigits(phone);
    if (!phoneDigits) {
      return null;
    }

    const cacheStore = this.readStore();
    const cacheHit = this.findByPhoneDigits(cacheStore, phoneDigits);
    if (cacheHit) {
      return cacheHit;
    }

    const lookup = await this.lookupPhonePrefix(phone);
    if (!lookup) {
      return null;
    }

    const normalized = this.toCacheEntry(lookup);
    if (!normalized) {
      return null;
    }

    const nextStore: PhonePrefixAreaCacheStore = {
      ...cacheStore,
      [normalized.dialCode]: normalized
    };
    this.writeStore(nextStore);

    return normalized;
  }

  private findByPhoneDigits(
    store: PhonePrefixAreaCacheStore,
    phoneDigits: string
  ): PhonePrefixAreaCacheEntry | null {
    const entries = Object.values(store);
    if (entries.length === 0) {
      return null;
    }

    const matching = entries
      .map((entry) => ({
        entry,
        dialDigits: this.normalizeDigits(entry.dialCode)
      }))
      .filter((item) => item.dialDigits.length > 0 && phoneDigits.startsWith(item.dialDigits))
      .sort((left, right) => right.dialDigits.length - left.dialDigits.length);

    return matching[0]?.entry ?? null;
  }

  private async lookupPhonePrefix(phone: string): Promise<PhonePrefixLookupResponse | null> {
    try {
      return await firstValueFrom(this.conversationsApiService.getPhonePrefix(phone));
    } catch {
      return null;
    }
  }

  private toCacheEntry(lookup: PhonePrefixLookupResponse): PhonePrefixAreaCacheEntry | null {
    const dialCode = this.normalizeDialCode(lookup.dialCode);
    if (!dialCode) {
      return null;
    }

    return {
      countryCode: this.normalizeCountryCode(lookup.countryCode),
      countryName: this.normalizeText(lookup.countryName),
      dialCode,
      subzone: this.normalizeText(lookup.subzone),
      subzoneName: this.normalizeText(lookup.subzoneName)
    };
  }

  private normalizeDialCode(dialCode: string | null): string | null {
    if (typeof dialCode !== 'string') {
      return null;
    }

    const normalizedDigits = this.normalizeDigits(dialCode);
    if (!normalizedDigits) {
      return null;
    }

    return `+${normalizedDigits}`;
  }

  private normalizeCountryCode(countryCode: string | null): string | null {
    if (typeof countryCode !== 'string') {
      return null;
    }

    const normalized = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeText(value: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeDigits(value: string): string {
    return value.replace(/\D+/g, '');
  }

  private readStore(): PhonePrefixAreaCacheStore {
    const storage = this.getStorage();
    if (!storage) {
      return {};
    }

    const raw = storage.getItem(PhonePrefixCacheService.STORAGE_KEY);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      const entries = Object.entries(parsed as Record<string, unknown>);
      const safeStore: PhonePrefixAreaCacheStore = {};

      for (const [dialCode, value] of entries) {
        const normalizedDialCode = this.normalizeDialCode(dialCode);
        if (!normalizedDialCode || !value || typeof value !== 'object') {
          continue;
        }

        const entry = value as Partial<PhonePrefixAreaCacheEntry>;
        safeStore[normalizedDialCode] = {
          countryCode: this.normalizeCountryCode(entry.countryCode ?? null),
          countryName: this.normalizeText(entry.countryName ?? null),
          dialCode: normalizedDialCode,
          subzone: this.normalizeText(entry.subzone ?? null),
          subzoneName: this.normalizeText(entry.subzoneName ?? null)
        };
      }

      return safeStore;
    } catch {
      return {};
    }
  }

  private writeStore(store: PhonePrefixAreaCacheStore): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(PhonePrefixCacheService.STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignore storage quota/security errors. In this case cache is memory-only for current flow.
    }
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
      return null;
    }

    return window.sessionStorage;
  }
}
