// Totals and comparisons for the offer comparator. Pure functions, unit-tested.

export const BELGIAN_VAT = 0.21;

export type RequestItem = { id: string; label: string; quantity: number; unit: string };

export type Offer = {
  id: string;
  supplierName: string;
  status: 'invited' | 'submitted' | 'declined' | 'awarded' | 'not_selected';
  deliveryFee: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  comment: string | null;
  remindedAt: string | null;
  /** Unit price per request item id, excluding VAT. */
  prices: Record<string, number>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function offerTotals(items: RequestItem[], offer: Offer) {
  const goods = items.reduce((sum, item) => sum + (offer.prices[item.id] ?? 0) * item.quantity, 0);
  const exVat = round2(goods + (offer.deliveryFee ?? 0));
  const vat = round2(exVat * BELGIAN_VAT);
  return { exVat, vat, incVat: round2(exVat + vat) };
}

/** Offers that carry prices: submitted, or already decided on. */
export function pricedOffers(offers: Offer[]): Offer[] {
  return offers.filter((o) => o.status === 'submitted' || o.status === 'awarded' || o.status === 'not_selected');
}

export function compareOffers(items: RequestItem[], offers: Offer[]) {
  const priced = pricedOffers(offers);
  const totals = new Map(priced.map((o) => [o.id, offerTotals(items, o)]));

  let cheapestId: string | null = null;
  let fastestId: string | null = null;
  for (const o of priced) {
    if (cheapestId === null || totals.get(o.id)!.exVat < totals.get(cheapestId)!.exVat) cheapestId = o.id;
    if (o.leadTimeDays !== null) {
      const best = fastestId === null ? null : priced.find((p) => p.id === fastestId)!.leadTimeDays!;
      if (best === null || o.leadTimeDays < best) fastestId = o.id;
    }
  }

  /** For each item, the lowest unit price among priced offers. */
  const lowestUnitPrice: Record<string, number> = {};
  for (const item of items) {
    const prices = priced.map((o) => o.prices[item.id]).filter((p): p is number => p !== undefined);
    if (prices.length) lowestUnitPrice[item.id] = Math.min(...prices);
  }

  return { priced, totals, cheapestId, fastestId, lowestUnitPrice };
}
