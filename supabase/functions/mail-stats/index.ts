// Read-only: what Brevo knows about the price requests e-mailed to suppliers in the
// last 14 days (delivered, opened, clicked, bounced), per supplier address. Cron-gated.

import { isCron } from '../_shared/cron.ts';
import { adminClient, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const admin = adminClient();
  if (!(await isCron(req, admin))) return json({ error: 'unauthorized' }, 401);
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return json({ error: 'no_brevo' }, 500);

  const since = new Date(Date.now() - 14 * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const { data: quotes } = await admin.from('quotes').select('supplier:companies(email, quote_email)').gte('created_at', since.toISOString());
  const emails = [
    ...new Set(
      (quotes ?? [])
        .map((q) => q.supplier as unknown as { email: string | null; quote_email: string | null } | null)
        .map((s) => (s?.quote_email ?? s?.email ?? '').toLowerCase())
        .filter(Boolean),
    ),
  ];

  const result: Record<string, { date: string; event: string; subject: string }[]> = {};
  for (const email of emails) {
    const res = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/events?email=${encodeURIComponent(email)}&startDate=${day(since)}&endDate=${day(new Date())}&limit=100&sort=asc`,
      { headers: { 'api-key': apiKey } },
    );
    if (!res.ok) {
      result[email] = [{ date: '', event: `error ${res.status}`, subject: '' }];
      continue;
    }
    const body = (await res.json()) as { events?: { date: string; event: string; subject?: string }[] };
    result[email] = (body.events ?? []).map((e) => ({ date: e.date, event: e.event, subject: (e.subject ?? '').slice(0, 80) }));
  }
  return json({ marker: 'mail-stats-v1', emails: emails.length, result });
});
