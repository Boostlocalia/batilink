// Answers asked at sign-up. The keys match the database checks
// (supabase/migrations/20261019000000_signup_profiles.sql).

export type Profile = 'contractor' | 'supplier' | 'architect';

export const REGIONS = ['BRU', 'BW', 'VB', 'ANT', 'LIM', 'LIE', 'NAM', 'HAI', 'LUX', 'WVL', 'OVL'] as const;
export type Region = (typeof REGIONS)[number];

/** Province of a Belgian postal code, to pre-select the work area. */
export function regionOf(postalCode: string): Region | null {
  const n = Number(postalCode);
  if (!/^[1-9]\d{3}$/.test(postalCode)) return null;
  if (n < 1300) return 'BRU';
  if (n < 1500) return 'BW';
  if (n < 2000) return 'VB';
  if (n < 3000) return 'ANT';
  if (n < 3500) return 'VB';
  if (n < 4000) return 'LIM';
  if (n < 5000) return 'LIE';
  if (n < 6000) return 'NAM';
  if (n < 6600) return 'HAI';
  if (n < 7000) return 'LUX';
  if (n < 8000) return 'HAI';
  if (n < 9000) return 'WVL';
  return 'OVL';
}

export const TEAM_SIZES = ['1', '2-5', '6-20', '21-50', '50+'] as const;
export const WORK_TYPES = ['new_build', 'renovation', 'maintenance', 'finishing', 'energy'] as const;
export const CLIENT_TYPES = ['private', 'professional', 'public'] as const;
export const MONTHLY_PURCHASES = ['lt5k', '5-20k', '20-50k', 'gt50k'] as const;
export const SUPPLIER_TYPES = ['merchant', 'manufacturer', 'wholesaler', 'rental'] as const;
export const PROJECT_TYPES = ['house', 'renovation', 'collective', 'tertiary', 'public'] as const;
export const PROJECTS_PER_YEAR = ['lt5', '5-15', '15-40', 'gt40'] as const;
export const HEARD_FROM = ['search', 'supplier', 'colleague', 'federation', 'social', 'fair', 'accountant', 'other'] as const;

export const TERMS_VERSION = '2026-10';

export function isPhone(value: string): boolean {
  return /^\+?[0-9 ./-]{8,20}$/.test(value.trim());
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
