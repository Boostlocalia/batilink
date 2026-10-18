import { describe, expect, it } from 'vitest';

import { canSendPriceRequest, monthStart, PLANS } from '../plans';

describe('canSendPriceRequest', () => {
  it('keeps price requests for Premium', () => {
    expect(canSendPriceRequest('free', 0, 3)).toEqual({ ok: false, reason: 'plan' });
    expect(canSendPriceRequest('pro', 0, 3)).toEqual({ ok: false, reason: 'plan' });
  });

  it('never limits Premium', () => {
    expect(canSendPriceRequest('full', 120, 40)).toEqual({ ok: true });
  });

  it('needs at least one supplier', () => {
    expect(canSendPriceRequest('full', 0, 0)).toMatchObject({ ok: false, reason: 'no_supplier' });
  });
});

describe('plans', () => {
  it('keeps the agreed prices', () => {
    expect([PLANS.free.priceExVat, PLANS.pro.priceExVat, PLANS.full.priceExVat]).toEqual([0, 69.99, 129.99]);
    expect([PLANS.pro.priceYearExVat, PLANS.full.priceYearExVat]).toEqual([699.9, 1299.9]);
  });

  it('limits Test to 3 network exchanges a month and a preview of suppliers', () => {
    expect(PLANS.free.networkExchangesPerMonth).toBe(3);
    expect(PLANS.free.suppliers).toBe('preview');
  });

  it('gives Starter the full network without suppliers', () => {
    expect(PLANS.pro.networkExchangesPerMonth).toBe(Infinity);
    expect(PLANS.pro.suppliers).toBe('none');
  });
});

describe('monthStart', () => {
  it('returns the first day of the month in UTC', () => {
    expect(monthStart(new Date('2026-10-17T23:14:06Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
