// Moves an agreement forward (a subcontract between contractors, or an architect
// putting a contractor forward for a project).
// - The subcontractor accepts a proposed agreement.
// - The client confirms they will withhold the legal share (when the
//   subcontractor has social or tax debts).
// Each time, both companies are checked again against the registers, right now,
// before anything is confirmed.

import { logEvent } from '../_shared/events.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { decideAgreement } from '../_shared/verification.ts';
import { verifyCompany } from '../_shared/verify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { agreement_id: agreementId, acknowledge_retention: acknowledge } = (await req.json()) as {
    agreement_id: string;
    acknowledge_retention?: boolean;
  };
  const { data: agreement } = await admin
    .from('agreements')
    .select('id, kind, client_id, subcontractor_id, opportunity_id, response_id, status, subcontractor_accepted_at, retention_acknowledged_at')
    .eq('id', agreementId)
    .maybeSingle();
  if (!agreement || ![agreement.client_id, agreement.subcontractor_id].includes(companyId)) return json({ error: 'not_found' }, 404);

  const isSub = companyId === agreement.subcontractor_id;
  if (isSub && agreement.status !== 'proposed') return json({ error: 'not_open' }, 409);
  if (!isSub && (agreement.status !== 'awaiting_retention_ack' || acknowledge !== true)) return json({ error: 'not_open' }, 409);

  // Fresh checks on both sides, now.
  const [client, sub] = await Promise.all([
    verifyCompany(admin, agreement.client_id, 'agreement', agreement.id),
    verifyCompany(admin, agreement.subcontractor_id, 'agreement', agreement.id),
  ]);
  if (!client || !sub) return json({ error: 'not_found' }, 404);

  const acknowledged = !isSub || Boolean(agreement.retention_acknowledged_at);
  const decision = decideAgreement(client.results, sub.results, sub.retention, acknowledged, agreement.kind);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: decision.status, checked_at: now };
  if (isSub) update.subcontractor_accepted_at = now;
  else update.retention_acknowledged_at = now;
  if (decision.status === 'blocked') update.blocked_findings = decision.findings;
  else {
    update.blocked_findings = [];
    update.retention_social_pct = decision.retention.socialPct;
    update.retention_tax_pct = decision.retention.taxPct;
    if (decision.status === 'confirmed') update.confirmed_at = now;
  }

  // Only move on from the state we read, so two taps cannot both apply.
  const { data: moved } = await admin.from('agreements').update(update).eq('id', agreement.id).eq('status', agreement.status).select('id');
  if (!moved?.length) return json({ error: 'not_open' }, 409);

  if (decision.status === 'confirmed' && agreement.response_id) {
    await admin.from('opportunity_responses').update({ status: 'selected' }).eq('id', agreement.response_id);
    // A subcontract fills the post; an architect's project may need several trades.
    if (agreement.kind === 'subcontract' && agreement.opportunity_id) {
      await admin.from('opportunities').update({ status: 'awarded' }).eq('id', agreement.opportunity_id);
    }
  }

  await logEvent(admin, {
    kind: 'agreement_checked',
    company_id: companyId,
    data: { agreement_id: agreement.id, status: decision.status, ...(decision.status === 'blocked' ? { findings: decision.findings } : {}) },
  });
  return json(decision);
});
