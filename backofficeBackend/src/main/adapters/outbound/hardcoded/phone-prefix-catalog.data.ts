import { PHONE_PREFIX_COUNTRY_CATALOG_CANADA } from './phone-prefix-catalog.country-canada.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_UNITED_STATES } from './phone-prefix-catalog.country-united-states.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_LATIN_AMERICA_CARIBBEAN } from './phone-prefix-catalog.region-latin-america-caribbean.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_EUROPE_ZONES_3_4 } from './phone-prefix-catalog.region-europe-zones-3-4.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_AFRICA } from './phone-prefix-catalog.region-africa.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_MIDDLE_EAST } from './phone-prefix-catalog.region-middle-east.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_ASIA } from './phone-prefix-catalog.region-asia.data';
import { PHONE_PREFIX_COUNTRY_CATALOG_OCEANIA } from './phone-prefix-catalog.region-oceania.data';
export { NANP_AREA_SUBZONE_CATALOG } from './phone-prefix-catalog.nanp-subzones.data';
export type { NanpAreaSubzoneEntry, PhonePrefixCountryEntry } from './phone-prefix-catalog.types';

export const PHONE_PREFIX_COUNTRY_CATALOG = [
  ...PHONE_PREFIX_COUNTRY_CATALOG_CANADA,
  ...PHONE_PREFIX_COUNTRY_CATALOG_UNITED_STATES,
  ...PHONE_PREFIX_COUNTRY_CATALOG_LATIN_AMERICA_CARIBBEAN,
  ...PHONE_PREFIX_COUNTRY_CATALOG_EUROPE_ZONES_3_4,
  ...PHONE_PREFIX_COUNTRY_CATALOG_AFRICA,
  ...PHONE_PREFIX_COUNTRY_CATALOG_MIDDLE_EAST,
  ...PHONE_PREFIX_COUNTRY_CATALOG_ASIA,
  ...PHONE_PREFIX_COUNTRY_CATALOG_OCEANIA
];
