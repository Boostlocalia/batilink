// Belgian formats: dates typed as DD/MM/YYYY, stored as ISO YYYY-MM-DD.

/** Parses "28/10/2026" (also "28-10-2026" or "28.10.2026") into "2026-10-28", or null. */
export function parseBelgianDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2026-10-28" → "28/10/2026". */
export function toBelgianDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

export function formatEuro(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
}

/** Accepts "6,20" as well as "6.20". */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  return Number(normalized);
}

export function normalizeVat(input: string): string {
  return input.toUpperCase().replace(/[\s.]/g, '');
}

export const isBelgianVat = (vat: string) => /^BE[01]\d{9}$/.test(normalizeVat(vat));
export const isBelgianPostalCode = (code: string) => /^[1-9]\d{3}$/.test(code.trim());

/** Suppliers have 48 hours to answer a price request: the deadline's date (YYYY-MM-DD). */
export const REPLY_HOURS = 48;
export function replyDeadline(sentAt: Date): string {
  return new Date(sentAt.getTime() + REPLY_HOURS * 3_600_000).toISOString().slice(0, 10);
}
