import { Injectable } from '@nestjs/common';
import type {
  PhonePrefixCatalogPort,
  PhonePrefixLookupResult
} from '../../../application/ports/outbound/phone-prefix-catalog.port';
import {
  NANP_AREA_SUBZONE_CATALOG,
  PHONE_PREFIX_COUNTRY_CATALOG
} from './phone-prefix-catalog.data';

type CountryPrefixMatch = {
  dialDigits: string;
  dialCode: string;
  countryCode: string;
  countryName: string;
};

@Injectable()
export class HardcodedPhonePrefixCatalogAdapter implements PhonePrefixCatalogPort {
  private readonly countryPrefixes = PHONE_PREFIX_COUNTRY_CATALOG;
  private readonly subzoneByNanpAreaCode = new Map(
    NANP_AREA_SUBZONE_CATALOG.map((entry) => [entry.areaCode, entry])
  );

  public lookupByPhone(rawPhone: string): PhonePrefixLookupResult {
    const normalizedDigits = rawPhone.replace(/\D/g, '');

    if (!normalizedDigits) {
      return {
        normalizedDigits,
        countryCode: null,
        countryName: null,
        dialCode: null,
        subzone: null,
        subzoneName: null
      };
    }

    const countryMatch = this.findBestCountryMatch(normalizedDigits);

    if (!countryMatch) {
      return {
        normalizedDigits,
        countryCode: null,
        countryName: null,
        dialCode: null,
        subzone: null,
        subzoneName: null
      };
    }

    const subzone = this.resolveSubzone(countryMatch, normalizedDigits);

    return {
      normalizedDigits,
      countryCode: countryMatch.countryCode,
      countryName: countryMatch.countryName,
      dialCode: countryMatch.dialCode,
      subzone: subzone?.subzone ?? null,
      subzoneName: subzone?.subzoneName ?? null
    };
  }

  private findBestCountryMatch(normalizedDigits: string): CountryPrefixMatch | null {
    const exactOrderedMatches = this.countryPrefixes.filter((entry) =>
      normalizedDigits.startsWith(entry.dialDigits)
    );

    const bestMatch = exactOrderedMatches[0] ?? null;

    if (bestMatch) {
      return bestMatch;
    }

    if (normalizedDigits.startsWith('1')) {
      return {
        dialDigits: '1',
        dialCode: '+1',
        countryCode: 'US',
        countryName: 'United States'
      };
    }

    return null;
  }

  private resolveSubzone(
    countryMatch: CountryPrefixMatch,
    normalizedDigits: string
  ): { subzone: string; subzoneName: string } | null {
    if (countryMatch.countryCode !== 'US') {
      return null;
    }

    if (normalizedDigits.startsWith('1555')) {
      return {
        subzone: 'MV',
        subzoneName: 'Movieland!'
      };
    }

    if (normalizedDigits.length < 4) {
      return null;
    }

    const areaCode = normalizedDigits.slice(1, 4);
    const mappedSubzone = this.subzoneByNanpAreaCode.get(areaCode);

    if (!mappedSubzone?.subzone) {
      return null;
    }

    return {
      subzone: mappedSubzone.subzone,
      subzoneName: mappedSubzone.subzoneName
    };
  }
}
