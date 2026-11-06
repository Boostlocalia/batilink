import { describe, expect, it } from 'vitest';

import { canSendPriceRequest, effectivePlan, monthStart, PLANS, TRIAL_DAYS } from '../plans';

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

  it('gives nothing once the trial is over without a plan', () => {
    expect(PLANS.free.networkExchangesPerMonth).toBe(0);
    expect(PLANS.free.suppliers).toBe('none');
  });

  it('gives Starter the full network without suppliers', () => {
    expect(PLANS.pro.networkExchangesPerMonth).toBe(Infinity);
    expect(PLANS.pro.suppliers).toBe('none');
  });
});

describe('effectivePlan', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('lasts 7 days', () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it('ends an expired trial before the nightly job does', () => {
    expect(effectivePlan({ plan: 'full', status: 'active', trial_ends_at: '2026-10-19T11:00:00Z', provider_subscription_id: null }, now)).toBe('free');
    expect(effectivePlan({ plan: 'full', status: 'active', trial_ends_at: '2026-10-20T11:00:00Z', provider_subscription_id: null }, now)).toBe('full');
  });

  it('keeps a paid plan whatever the trial date', () => {
    expect(effectivePlan({ plan: 'full', status: 'active', trial_ends_at: '2026-10-01T00:00:00Z', provider_subscription_id: 'sub_1' }, now)).toBe('full');
    expect(effectivePlan({ plan: 'pro', status: 'canceled' }, now)).toBe('free');
  });
});

describe('monthStart', () => {
  it('returns the first day of the month in UTC', () => {
    expect(monthStart(new Date('2026-10-17T23:14:06Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
