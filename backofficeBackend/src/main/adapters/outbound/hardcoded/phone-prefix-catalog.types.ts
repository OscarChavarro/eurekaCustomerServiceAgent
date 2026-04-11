export type PhonePrefixCountryEntry = {
  dialDigits: string;
  dialCode: string;
  countryCode: string;
  countryName: string;
};

export type NanpAreaSubzoneEntry = {
  areaCode: string;
  subzone: string | null;
  subzoneName: string;
};
