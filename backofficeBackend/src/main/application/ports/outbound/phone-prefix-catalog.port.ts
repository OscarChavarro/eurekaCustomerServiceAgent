export type PhonePrefixLookupResult = {
  normalizedDigits: string;
  countryCode: string | null;
  countryName: string | null;
  dialCode: string | null;
  subzone: string | null;
  subzoneName: string | null;
};

export interface PhonePrefixCatalogPort {
  lookupByPhone(rawPhone: string): PhonePrefixLookupResult;
}
