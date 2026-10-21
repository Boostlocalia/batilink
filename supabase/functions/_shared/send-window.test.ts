import { describe, expect, it } from 'vitest';

import { isReminderTime } from './send-window';

describe('reminder window', () => {
  it('is early afternoon on weekdays, Brussels time', () => {
    expect(isReminderTime(new Date('2026-10-21T11:00:00Z'))).toBe(true); // Wed 13:00 CEST
    expect(isReminderTime(new Date('2026-10-21T12:00:00Z'))).toBe(true); // Wed 14:00
    expect(isReminderTime(new Date('2026-10-21T15:00:00Z'))).toBe(false); // Wed 17:00
    expect(isReminderTime(new Date('2026-10-21T07:00:00Z'))).toBe(false); // Wed 09:00
    expect(isReminderTime(new Date('2026-10-24T11:00:00Z'))).toBe(false); // Saturday
    expect(isReminderTime(new Date('2026-12-02T12:00:00Z'))).toBe(true); // Wed 13:00 CET
  });
});
