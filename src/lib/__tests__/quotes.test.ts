import { describe, expect, it } from 'vitest';

import { compareOffers, offerTotals, packageKey, type Offer, type RequestItem } from '../quotes';

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

  it('finds the lowest line per product', () => {
    expect(compareOffers(items, offers).lowestLine).toEqual({ ciment: 238, pir: 1104 });
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
    const { priced, cheapestId, lowestLine } = compareOffers(items, offers);
    expect(priced).toHaveLength(2);
    expect(cheapestId).toBe('right');
    expect(lowestLine).toEqual({ pir: 140 });
  });
});

describe('offers per package in different quantities', () => {
  const items: RequestItem[] = [{ id: 'sika', label: 'Sikafloor 400 N Elastic', quantity: 50, unit: 'm2' }];
  const base = { deliveryFee: null, leadTimeDays: null, validUntil: null, comment: null, remindedAt: null, status: 'submitted' as const };
  const offers: Offer[] = [
    { ...base, id: 'celis', supplierName: 'Celis', prices: { sika: 57.59 }, packages: { sika: { size: '6 kg', price: 239.97, count: 12 } } },
    { ...base, id: 'walmat', supplierName: 'Walmat', prices: { sika: 65.46 }, packages: { sika: { size: 'seau 6 kg', price: 204.557, count: 16 } } },
    { ...base, id: 'gobert', supplierName: 'Gobert', prices: { sika: 80.48 }, packages: { sika: { size: 'Seau de 6 KG', price: 223.56, count: 18 } } },
  ];

  it('are compared on the same number of packages', () => {
    const { basis, cheapestId, totals, lowestLine } = compareOffers(items, offers);
    expect(basis.sika).toMatchObject({ count: 18 });
    expect(cheapestId).toBe('walmat');
    expect(totals.get('walmat')!.exVat).toBe(3682.03);
    expect(totals.get('celis')!.exVat).toBe(4319.46);
    expect(lowestLine.sika).toBeCloseTo(3682.026);
  });

  it('recognise the same package however it is written', () => {
    expect(packageKey('Seau de 6 KG')).toBe('6kg');
    expect(packageKey('sac 25,5 kg')).toBe('25.5kg');
  });

  it('keep their own price when no other offer has the same package', () => {
    const { basis, totals } = compareOffers(items, [offers[0], { ...offers[1], packages: { sika: { size: 'seau 18 kg', price: 600, count: 5 } } }]);
    expect(basis).toEqual({});
    expect(totals.get('celis')!.exVat).toBe(2879.5);
  });
});
