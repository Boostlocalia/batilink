// Checks a company against the Belgian registers (VAT, BCE/KBO, 30bis debts).
// - Signed-in user: checks their own company (after sign-up, or on demand).
// - Cron (x-cron-secret): re-checks companies whose last check is over 30 days old.

import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { verifyCompany } from '../_shared/verify.ts';

const RECHECK_AFTER_DAYS = 30;
const BATCH = 50;
const MIN_INTERVAL_MS = 10 * 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();

  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') === secret) {
    const before = new Date(Date.now() - RECHECK_AFTER_DAYS * 86_400_000).toISOString();
    const { data: due } = await admin
      .from('companies')
      .select('id')
      .or(`last_checked_at.is.null,last_checked_at.lt.${before}`)
      .not('vat_number', 'is', null)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH);
    const statuses: Record<string, number> = {};
    for (const c of due ?? []) {
      const v = await verifyCompany(admin, c.id, 'periodic');
      if (v) statuses[v.status] = (statuses[v.status] ?? 0) + 1;
    }
    return json({ checked: due?.length ?? 0, statuses });
  }

  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);
  const { data: company } = await admin.from('companies').select('last_checked_at').eq('id', companyId).single();
  if (company?.last_checked_at && Date.now() - new Date(company.last_checked_at).getTime() < MIN_INTERVAL_MS) {
    return json({ error: 'too_soon' }, 429);
  }
  const v = await verifyCompany(admin, companyId, company?.last_checked_at ? 'manual' : 'signup');
  if (!v) return json({ error: 'not_found' }, 404);
  return json({ status: v.status, checks: v.results.map((r) => ({ kind: r.kind, outcome: r.outcome, findings: r.findings })) });
});
