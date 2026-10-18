import { describe, expect, it } from 'vitest';

import { parseRetention } from './checks-parse.ts';
import {
  decide,
  decideAgreement,
  enterpriseNumber,
  isValidEnterpriseNumber,
  kboOutcome,
  requiredChecks,
  type CheckResult,
} from './verification.ts';

const ok = (kind: CheckResult['kind']): CheckResult => ({ kind, outcome: 'ok', findings: [], evidence: {} });

describe('enterprise numbers', () => {
  it('derives the number from the VAT number and checks the digits', () => {
    expect(enterpriseNumber('BE0403.170.701')).toBe('0403170701');
    expect(isValidEnterpriseNumber('0403170701')).toBe(true);
    expect(isValidEnterpriseNumber('0403170702')).toBe(false);
    expect(isValidEnterpriseNumber('2403170701')).toBe(false);
  });
});

describe('KBO', () => {
  it('needs an active enterprise with the right activity', () => {
    expect(kboOutcome(null).outcome).toBe('failed');
    expect(kboOutcome({ status: 'gone', nace_codes: ['43320'] }).findings).toEqual(['kbo_not_active']);
    expect(kboOutcome({ status: 'AC', nace_codes: ['43320'] }).outcome).toBe('ok');
    expect(kboOutcome({ status: 'AC', nace_codes: [] }).findings).toEqual(['kbo_no_construction_activity']);
    expect(kboOutcome({ status: 'AC', nace_codes: ['71111'] }, 'architect').outcome).toBe('ok');
    expect(kboOutcome({ status: 'AC', nace_codes: [] }, 'supplier').outcome).toBe('ok');
  });
});

describe('verification decision', () => {
  it('verifies only when every required register answered ok', () => {
    expect(decide([ok('vat'), ok('kbo'), ok('retention')])).toBe('verified');
    expect(decide([ok('vat'), ok('kbo')], requiredChecks('architect'))).toBe('verified');
    expect(decide([ok('vat'), ok('kbo')], requiredChecks('contractor'))).toBe('needs_review');
    expect(decide([ok('vat'), ok('kbo'), { ...ok('retention'), outcome: 'unavailable' }])).toBe('needs_review');
    expect(decide([ok('vat'), ok('kbo'), { ...ok('retention'), outcome: 'warning' }])).toBe('needs_review');
    expect(decide([{ ...ok('vat'), outcome: 'failed', findings: ['vat_invalid'] }, ok('kbo'), ok('retention')])).toBe('rejected');
  });
});

describe('agreement decision', () => {
  const clean = { socialPct: 0, taxPct: 0 };
  const debts = { socialPct: 35, taxPct: 15 };
  const all = [ok('vat'), ok('kbo'), ok('retention')];

  it('confirms when both sides are clean', () => {
    expect(decideAgreement([ok('vat'), ok('kbo')], all, clean, false)).toEqual({ status: 'confirmed', retention: clean });
  });

  it('asks the client to acknowledge withholding when the subcontractor has debts', () => {
    expect(decideAgreement(all, all, debts, false).status).toBe('awaiting_retention_ack');
    expect(decideAgreement(all, all, debts, true).status).toBe('confirmed');
    expect(decideAgreement(all, all, debts, false, 'referral')).toEqual({ status: 'confirmed', retention: debts });
  });

  it('blocks when a register says no or the 30bis answer is missing', () => {
    const bad = [ok('vat'), { ...ok('kbo'), outcome: 'failed' as const, findings: ['kbo_not_active'] }, ok('retention')];
    expect(decideAgreement(all, bad, clean, true)).toEqual({ status: 'blocked', findings: ['subcontractor:kbo_not_active'] });
    expect(decideAgreement(all, all, null, true)).toEqual({ status: 'blocked', findings: ['subcontractor:retention_unavailable'] });
    const vatDown = [{ ...ok('vat'), outcome: 'unavailable' as const, findings: ['vat_register_unavailable'] }, ok('kbo')];
    expect(decideAgreement(vatDown, all, clean, true)).toEqual({ status: 'blocked', findings: ['client:vat_register_unavailable'] });
  });
});

describe('30bis answer', () => {
  it('reads both percentages and refuses anything it does not understand', () => {
    expect(parseRetention({ socialSecurity: { retainmentObligation: false }, tax: { retainmentObligation: false } })).toEqual({ socialPct: 0, taxPct: 0 });
    expect(parseRetention({ social: { retainmentObligation: true, percentage: 35 }, fiscal: { retainmentObligation: true, percentage: 15 } })).toEqual({ socialPct: 35, taxPct: 15 });
    expect(parseRetention({ social: { retainmentObligation: true } , tax: { retainmentObligation: false } })).toBeNull();
    expect(parseRetention({})).toBeNull();
    expect(parseRetention(null)).toBeNull();
  });
});
