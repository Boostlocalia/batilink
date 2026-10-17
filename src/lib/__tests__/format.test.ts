import { describe, expect, it } from 'vitest';

import { isBelgianPostalCode, isBelgianVat, normalizeVat, parseAmount, parseBelgianDate, toBelgianDate } from '../format';

describe('parseBelgianDate', () => {
  it('reads DD/MM/YYYY and its common variants', () => {
    expect(parseBelgianDate('28/10/2026')).toBe('2026-10-28');
    expect(parseBelgianDate('2.11.2026')).toBe('2026-11-02');
    expect(parseBelgianDate(' 1-1-2027 ')).toBe('2027-01-01');
  });

  it('rejects impossible dates and other formats', () => {
    expect(parseBelgianDate('31/02/2026')).toBeNull();
    expect(parseBelgianDate('2026-10-28')).toBeNull();
    expect(parseBelgianDate('')).toBeNull();
  });

  it('round-trips with toBelgianDate', () => {
    expect(toBelgianDate('2026-11-15')).toBe('15/11/2026');
  });
});

describe('parseAmount', () => {
  it('accepts a decimal comma or point', () => {
    expect(parseAmount('6,20')).toBe(6.2);
    expect(parseAmount('14.9')).toBe(14.9);
    expect(parseAmount(' 1 192 ')).toBe(1192);
  });

  it('rejects text and negatives', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-3')).toBeNull();
  });
});

describe('Belgian identifiers', () => {
  it('normalises and checks VAT numbers', () => {
    expect(normalizeVat('be 0123.456.789')).toBe('BE0123456789');
    expect(isBelgianVat('BE 0123.456.789')).toBe(true);
    expect(isBelgianVat('FR12345678901')).toBe(false);
  });

  it('checks 4-digit postal codes', () => {
    expect(isBelgianPostalCode('1410')).toBe(true);
    expect(isBelgianPostalCode('0410')).toBe(false);
    expect(isBelgianPostalCode('14100')).toBe(false);
  });
});
