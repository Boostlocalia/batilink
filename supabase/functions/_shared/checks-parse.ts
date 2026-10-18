// Parsing of the 30bis answer, import-free so the app's tests can run it.

import type { Retention } from './verification.ts';

/** Reads the withholding percentages from one company's answer; null if not understood. */
export function parseRetention(entry: unknown): Retention | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  const pct = (v: unknown) => (typeof v === 'number' && v >= 0 && v <= 100 ? v : null);
  const decision = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);
  const social = decision(e.socialSecurity ?? e.social);
  const tax = decision(e.tax ?? e.fiscal);
  const socialPct = social ? (social.retainmentObligation === false ? 0 : pct(social.percentage)) : null;
  const taxPct = tax ? (tax.retainmentObligation === false ? 0 : pct(tax.percentage)) : null;
  if (socialPct === null || taxPct === null) return null;
  return { socialPct, taxPct };
}
