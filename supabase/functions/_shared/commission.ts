// Commission the supplier owes when a contractor awards their offer.
// Kept free of imports so the app (display) and the functions (billing) share it.

export const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * Launch phase: suppliers answer for free and no commission is recorded or
 * mentioned. Set to true once suppliers have agreed terms with Batinode.
 */
export const SUPPLIER_COMMISSION_ACTIVE = false;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Offer total excluding VAT: every line plus delivery. */
export function offerTotalExVat(
  lines: { quantity: number; unitPrice: number }[],
  deliveryFee: number,
): number {
  return round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) + deliveryFee);
}

export function commissionFor(baseExVat: number, rate = DEFAULT_COMMISSION_RATE): number {
  return round2(baseExVat * rate);
}

/** "5 %" in fr-BE, "5%" in nl-BE. */
export function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(rate);
}
