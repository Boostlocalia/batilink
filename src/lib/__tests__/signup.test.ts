import { describe, expect, it } from 'vitest';

import { PLANS } from '../plans';
import { isPhone, regionOf } from '../signup';

describe('regionOf', () => {
  it('maps postal codes to provinces', () => {
    expect(regionOf('1000')).toBe('BRU');
    expect(regionOf('1410')).toBe('BW');
    expect(regionOf('1500')).toBe('VB');
    expect(regionOf('3000')).toBe('VB');
    expect(regionOf('3500')).toBe('LIM');
    expect(regionOf('2000')).toBe('ANT');
    expect(regionOf('4000')).toBe('LIE');
    expect(regionOf('5000')).toBe('NAM');
    expect(regionOf('6000')).toBe('HAI');
    expect(regionOf('6700')).toBe('LUX');
    expect(regionOf('7000')).toBe('HAI');
    expect(regionOf('8000')).toBe('WVL');
    expect(regionOf('9000')).toBe('OVL');
  });

  it('ignores anything that is not a Belgian postal code', () => {
    expect(regionOf('0999')).toBeNull();
    expect(regionOf('141')).toBeNull();
    expect(regionOf('abcd')).toBeNull();
  });
});

describe('isPhone', () => {
  it('accepts Belgian formats', () => {
    expect(isPhone('+32 470 12 34 56')).toBe(true);
    expect(isPhone('0470/12.34.56')).toBe(true);
    expect(isPhone('12')).toBe(false);
  });
});

describe('yearly prices', () => {
  it('give two months free', () => {
    expect(PLANS.pro.priceYearExVat).toBeCloseTo(PLANS.pro.priceExVat * 10, 2);
    expect(PLANS.full.priceYearExVat).toBeCloseTo(PLANS.full.priceExVat * 10, 2);
  });
});
