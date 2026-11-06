import { describe, expect, it } from 'vitest';

import { PROJECT_COMMISSION_RATE, projectCommission } from '../project-commission';

describe('projectCommission', () => {
  it('takes 5 % of the project amount', () => {
    expect(PROJECT_COMMISSION_RATE).toBe(0.05);
    expect(projectCommission(48_000)).toBe(2400);
  });

  it('rounds to the cent', () => {
    expect(projectCommission(1234.57)).toBe(61.73);
  });
});
