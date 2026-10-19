import { describe, expect, it } from 'vitest';

import { sameSecret } from './limits';

describe('sameSecret', () => {
  it('accepts only the exact secret', async () => {
    expect(await sameSecret('s3cret-value', 's3cret-value')).toBe(true);
    expect(await sameSecret('s3cret-valuE', 's3cret-value')).toBe(false);
    expect(await sameSecret('s3cret', 's3cret-value')).toBe(false);
  });

  it('refuses when either side is missing', async () => {
    expect(await sameSecret(null, 'x')).toBe(false);
    expect(await sameSecret('x', undefined)).toBe(false);
    expect(await sameSecret('', '')).toBe(false);
  });
});
