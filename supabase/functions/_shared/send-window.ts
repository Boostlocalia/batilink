// Supplier reminders go out early afternoon on weekdays (Brussels time), while the shop
// staff are still at the counter and can answer straight away (Henrique's rule).

const REMINDER_HOURS = [13, 14];

/** Hour (0-23) and weekday (0 = Sunday) in Brussels. */
export function brusselsClock(at: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
  return { hour, weekday };
}

export function isReminderTime(at: Date): boolean {
  const { hour, weekday } = brusselsClock(at);
  return weekday >= 1 && weekday <= 5 && REMINDER_HOURS.includes(hour);
}
