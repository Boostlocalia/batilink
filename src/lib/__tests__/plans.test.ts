import { describe, expect, it } from 'vitest';

import { canSendPriceRequest, monthStart, PLANS } from '../plans';

describe('canSendPriceRequest', () => {
  it('lets a free company send its one trial request to 3 suppliers', () => {
    expect(canSendPriceRequest('free', 0, 3)).toEqual({ ok: true });
  });

  it('stops a free company above 3 suppliers', () => {
    expect(canSendPriceRequest('free', 0, 4)).toEqual({ ok: false, reason: 'too_many_suppliers', limit: 3 });
  });

  it('stops free and pro after one request in the month', () => {
    expect(canSendPriceRequest('free', 1, 2)).toMatchObject({ ok: false, reason: 'monthly_limit' });
    expect(canSendPriceRequest('pro', 1, 2)).toMatchObject({ ok: false, reason: 'monthly_limit' });
  });

  it('lets pro send its trial request to every supplier', () => {
    expect(canSendPriceRequest('pro', 0, 25)).toEqual({ ok: true });
  });

  it('never limits the full plan', () => {
    expect(canSendPriceRequest('full', 120, 40)).toEqual({ ok: true });
  });

  it('needs at least one supplier', () => {
    expect(canSendPriceRequest('full', 0, 0)).toMatchObject({ ok: false, reason: 'no_supplier' });
  });
});

describe('plans', () => {
  it('keeps the agreed prices', () => {
    expect([PLANS.free.priceExVat, PLANS.pro.priceExVat, PLANS.full.priceExVat]).toEqual([0, 39, 89]);
  });

  it('reserves the contractor network to pro and full', () => {
    expect(PLANS.free.network).toBe('read');
    expect(PLANS.pro.network).toBe('full');
  });
});

describe('monthStart', () => {
  it('returns the first day of the month in UTC', () => {
    expect(monthStart(new Date('2026-10-17T23:14:06Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
