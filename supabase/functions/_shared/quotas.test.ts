import { describe, expect, it } from 'vitest';

import { levelOf, planLimits } from './quotas';

describe('quota levels', () => {
  it('warns at 70 % and alerts at 90 % of a limit', () => {
    expect(levelOf({ service: 'emails', used: 200, limit: 300, note: '' })).toBe('ok');
    expect(levelOf({ service: 'emails', used: 210, limit: 300, note: '' })).toBe('warn');
    expect(levelOf({ service: 'emails', used: 270, limit: 300, note: '' })).toBe('critical');
  });

  it('uses the free plans unless a secret says otherwise', () => {
    expect(planLimits(() => undefined).emailsPerDay).toBe(300);
    expect(planLimits((k) => (k === 'QUOTA_EMAILS_PER_DAY' ? '20000' : undefined)).emailsPerDay).toBe(20000);
  });
});
