import { Injectable } from '@angular/core';

import type { SupportedLanguage } from '../types/supported-language.type';
import { PHONE_COUNTRY_TRANSLATIONS } from '../translations/phone-country.translations';

@Injectable({ providedIn: 'root' })
export class PhoneCountryI18nService {
  public getCountryLabel(countryCode: string | null, language: SupportedLanguage): string | null {
    if (!countryCode) {
      return null;
    }

    const translation = PHONE_COUNTRY_TRANSLATIONS[countryCode.toUpperCase()];

    if (!translation) {
      return null;
    }

    return translation[language];
  }

  public getCountryName(countryCode: string | null, language: SupportedLanguage): string | null {
    const label = this.getCountryLabel(countryCode, language);
    if (!label) {
      return null;
    }

    return label.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '');
  }
}
