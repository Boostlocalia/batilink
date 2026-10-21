import { describe, expect, it } from 'vitest';

import { compareOffers, offerTotals, type Offer, type RequestItem } from '../quotes';

const items: RequestItem[] = [
  { id: 'ciment', label: 'Ciment CEM II 42,5 N', quantity: 40, unit: 'bag' },
  { id: 'pir', label: 'Panneau PIR 120 mm', quantity: 80, unit: 'piece' },
];

const offer = (id: string, ciment: number, pir: number, deliveryFee: number, leadTimeDays: number, status: Offer['status'] = 'submitted'): Offer => ({
  id,
  supplierName: id,
  status,
  deliveryFee,
  leadTimeDays,
  validUntil: null,
  comment: null,
  remindedAt: null,
  prices: { ciment, pir },
});

describe('offerTotals', () => {
  it('adds lines and delivery, then Belgian VAT at 21 %', () => {
    // 40 × 6.20 + 80 × 14.90 + 65 = 248 + 1192 + 65 = 1505
    expect(offerTotals(items, offer('a', 6.2, 14.9, 65, 2))).toEqual({ exVat: 1505, vat: 316.05, incVat: 1821.05 });
  });

  it('treats a missing delivery fee as free', () => {
    expect(offerTotals(items, { ...offer('a', 1, 1, 0, 1), deliveryFee: null }).exVat).toBe(120);
  });
});

describe('compareOffers', () => {
  const offers = [offer('delvaux', 6.2, 14.9, 65, 2), offer('peeters', 6.55, 13.8, 0, 4), offer('brabant', 5.95, 15.4, 80, 1), offer('uccle', 0, 0, 0, 0, 'invited')];

  it('ignores suppliers that have not answered', () => {
    expect(compareOffers(items, offers).priced.map((o) => o.id)).toEqual(['delvaux', 'peeters', 'brabant']);
  });

  it('finds the cheapest total and the fastest delivery', () => {
    const { cheapestId, fastestId } = compareOffers(items, offers);
    expect(cheapestId).toBe('peeters');
    expect(fastestId).toBe('brabant');
  });

  it('finds the lowest unit price per product', () => {
    expect(compareOffers(items, offers).lowestUnitPrice).toEqual({ ciment: 5.95, pir: 13.8 });
  });

  it('handles a request with no answer yet', () => {
    const result = compareOffers(items, [offers[3]]);
    expect(result.cheapestId).toBeNull();
    expect(result.fastestId).toBeNull();
  });
});

describe('offers read from a PDF', () => {
  const items: RequestItem[] = [
    { id: 'a', label: 'Colle', quantity: 10, unit: 'piece' },
    { id: 'b', label: 'Joint', quantity: 2, unit: 'piece' },
  ];
  const base = { deliveryFee: 0, leadTimeDays: null, validUntil: null, comment: null, remindedAt: null };
  const offers: Offer[] = [
    { ...base, id: 'typed', supplierName: 'A', status: 'submitted', prices: { a: 5, b: 3 } },
    { ...base, id: 'pdf', supplierName: 'B', status: 'invited', offerFile: 'x.pdf', prices: { a: 1 } },
    { ...base, id: 'pdf-empty', supplierName: 'C', status: 'invited', offerFile: 'y.pdf', prices: {} },
  ];

  it('are shown but never ranked cheapest', () => {
    const { priced, cheapestId } = compareOffers(items, offers);
    expect(priced.map((o) => o.id)).toEqual(['typed', 'pdf']);
    expect(cheapestId).toBe('typed');
  });
});

describe('a different product', () => {
  const items: RequestItem[] = [{ id: 'pir', label: 'PIR 120 mm', quantity: 10, unit: 'm2' }];
  const base = { deliveryFee: null, leadTimeDays: null, validUntil: null, comment: null, remindedAt: null };
  const offers: Offer[] = [
    { ...base, id: 'right', supplierName: 'A', status: 'submitted', prices: { pir: 14 } },
    { ...base, id: 'thinner', supplierName: 'B', status: 'submitted', prices: { pir: 11 }, details: { pir: { offered: null, mismatch: '100 mm au lieu de 120 mm' } } },
  ];

  it('is shown but not ranked against the requested one', () => {
    const { priced, cheapestId, lowestUnitPrice } = compareOffers(items, offers);
    expect(priced).toHaveLength(2);
    expect(cheapestId).toBe('right');
    expect(lowestUnitPrice).toEqual({ pir: 14 });
  });
});
