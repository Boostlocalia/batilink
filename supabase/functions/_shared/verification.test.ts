import { describe, expect, it } from 'vitest';

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
    expect(decide([ok('vat'), ok('kbo')])).toBe('verified');
    expect(decide([ok('vat'), ok('kbo')], requiredChecks('architect'))).toBe('verified');
    expect(decide([ok('vat'), ok('kbo')], requiredChecks('contractor'))).toBe('verified');
    expect(decide([ok('vat'), { ...ok('kbo'), outcome: 'unavailable' }])).toBe('needs_review');
    expect(decide([ok('vat'), { ...ok('kbo'), outcome: 'warning' }])).toBe('needs_review');
    expect(decide([{ ...ok('vat'), outcome: 'failed', findings: ['vat_invalid'] }, ok('kbo')])).toBe('rejected');
  });
});

describe('agreement decision', () => {
  const all = [ok('vat'), ok('kbo')];

  it('confirms when both companies are in good standing', () => {
    expect(decideAgreement(all, all)).toEqual({ status: 'confirmed' });
    expect(decideAgreement(all, [ok('vat'), { ...ok('kbo'), outcome: 'warning' as const, findings: ['kbo_no_construction_activity'] }])).toEqual({ status: 'confirmed' });
  });

  it('blocks when a register says no or cannot answer', () => {
    const bad = [ok('vat'), { ...ok('kbo'), outcome: 'failed' as const, findings: ['kbo_not_active'] }];
    expect(decideAgreement(all, bad)).toEqual({ status: 'blocked', findings: ['subcontractor:kbo_not_active'] });
    const vatDown = [{ ...ok('vat'), outcome: 'unavailable' as const, findings: ['vat_register_unavailable'] }, ok('kbo')];
    expect(decideAgreement(vatDown, all)).toEqual({ status: 'blocked', findings: ['client:vat_register_unavailable'] });
  });
});
