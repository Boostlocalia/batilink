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
  /** BatiNode asked the supplier to price the requested product instead. */
  correctionAsked?: boolean;
  /** The supplier's own quote (PDF) in the private quote-files bucket, if attached. */
  offerFile?: string | null;
  /** Unit price per request item id, excluding VAT. */
  prices: Record<string, number>;
  /** Per request item id, read from the supplier's PDF: their own line, and how it differs from the request. */
  details?: Record<string, { offered: string | null; mismatch: string | null }>;
  /** Per request item id, when sold by the package: the package, its price excluding VAT, and how many are offered. */
  packages?: Record<string, { size: string; price: number; count: number | null }>;
};

/** "Seau 6 kg", "seau de 6kg" and "6 KG" are the same package. */
export const packageKey = (size: string) =>
  size
    .toLowerCase()
    .match(/\d+(?:[.,]\d+)?\s*[a-zµ²³]+/)?.[0]
    .replace(/\s+/g, '')
    .replace(',', '.') ?? size.trim().toLowerCase();

/**
 * Offers priced per package in different quantities (12 buckets here, 18 there) are
 * compared on the same number of packages: the most any of them offers.
 */
export function commonPackages(items: RequestItem[], offers: Offer[]) {
  const basis: Record<string, { size: string; count: number; offers: string[] }> = {};
  for (const item of items) {
    const groups = new Map<string, Offer[]>();
    for (const o of offers) {
      const p = o.packages?.[item.id];
      if (!p || !p.size || !(p.price >= 0)) continue;
      const key = packageKey(p.size);
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    const [group] = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);
    if (!group) continue;
    const counts = group.map((o) => o.packages![item.id].count).filter((c): c is number => c !== null && c > 0);
    if (!counts.length) continue;
    basis[item.id] = { size: group[0].packages![item.id].size, count: Math.ceil(Math.max(...counts)), offers: group.map((o) => o.id) };
  }
  return basis;
}

/** An offer's price for one item: on the common number of packages when there is one. */
export function linePrice(item: RequestItem, offer: Offer, basis: ReturnType<typeof commonPackages>): number | undefined {
  const common = basis[item.id];
  if (common?.offers.includes(offer.id)) return common.count * offer.packages![item.id].price;
  const unit = offer.prices[item.id];
  return unit === undefined ? undefined : unit * item.quantity;
}

/** The supplier offers a different product on at least one line (thickness, size, reference...). */
export const differs = (o: Offer) => Object.values(o.details ?? {}).some((d) => Boolean(d.mismatch));

const round2 = (n: number) => Math.round(n * 100) / 100;

export function offerTotals(items: RequestItem[], offer: Offer, basis: ReturnType<typeof commonPackages> = {}) {
  const goods = items.reduce((sum, item) => sum + (linePrice(item, offer, basis) ?? 0), 0);
  const exVat = round2(goods + (offer.deliveryFee ?? 0));
  const vat = round2(exVat * BELGIAN_VAT);
  return { exVat, vat, incVat: round2(exVat + vat) };
}

/** An offer sent as a PDF whose prices Nodi read but the supplier has not confirmed: shown, never ranked. */
export const readFromPdf = (o: Offer) => o.status === 'invited' && Boolean(o.offerFile) && Object.keys(o.prices).length > 0;

/** Offers that carry prices: submitted, already decided on, or read from the supplier's PDF. */
export function pricedOffers(offers: Offer[]): Offer[] {
  return offers.filter((o) => o.status === 'submitted' || o.status === 'awarded' || o.status === 'not_selected' || readFromPdf(o));
}

export function compareOffers(items: RequestItem[], offers: Offer[]) {
  const priced = pricedOffers(offers);
  const basis = commonPackages(items, priced);
  const totals = new Map(priced.map((o) => [o.id, offerTotals(items, o, basis)]));

  let cheapestId: string | null = null;
  let fastestId: string | null = null;
  for (const o of priced) {
    if (readFromPdf(o) || differs(o)) continue;
    if (cheapestId === null || totals.get(o.id)!.exVat < totals.get(cheapestId)!.exVat) cheapestId = o.id;
    if (o.leadTimeDays !== null) {
      const best = fastestId === null ? null : priced.find((p) => p.id === fastestId)!.leadTimeDays!;
      if (best === null || o.leadTimeDays < best) fastestId = o.id;
    }
  }

  /** For each item, the lowest line price among priced offers of the requested product. */
  const lowestLine: Record<string, number> = {};
  for (const item of items) {
    const prices = priced
      .filter((o) => !differs(o))
      .map((o) => linePrice(item, o, basis))
      .filter((p): p is number => p !== undefined);
    if (prices.length) lowestLine[item.id] = Math.min(...prices);
  }

  return { priced, totals, cheapestId, fastestId, lowestLine, basis };
}
