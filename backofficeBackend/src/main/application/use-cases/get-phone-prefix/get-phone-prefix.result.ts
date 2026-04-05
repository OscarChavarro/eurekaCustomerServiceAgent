export type GetPhonePrefixResult = {
  input: string;
  normalizedDigits: string;
  countryCode: string | null;
  countryName: string | null;
  dialCode: string | null;
  subzone: string | null;
  subzoneName: string | null;
};
