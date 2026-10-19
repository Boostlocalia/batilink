// Moves an agreement forward (a subcontract between contractors, or an architect
// putting a contractor forward for a project).
// The subcontractor accepts a proposed agreement. Both companies are checked
// again against the registers (VAT, BCE/KBO), right now, before it is
// confirmed. A confirmed architect's project records the project commission
// when the contractor is subscribed.

import { logEvent } from '../_shared/events.ts';
import { PROJECT_COMMISSION_PAYER, PROJECT_COMMISSION_RATE, projectCommission, SUBSCRIBED_PLANS } from '../_shared/project-commission.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { decideAgreement } from '../_shared/verification.ts';
import { verifyCompany } from '../_shared/verify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { agreement_id: agreementId } = (await req.json()) as { agreement_id: string };
  const { data: agreement } = await admin
    .from('agreements')
    .select('id, kind, client_id, subcontractor_id, opportunity_id, response_id, amount_ex_vat, status')
    .eq('id', agreementId)
    .maybeSingle();
  if (!agreement || ![agreement.client_id, agreement.subcontractor_id].includes(companyId)) return json({ error: 'not_found' }, 404);
  if (companyId !== agreement.subcontractor_id || agreement.status !== 'proposed') return json({ error: 'not_open' }, 409);

  // Fresh checks on both sides, now.
  const [client, sub] = await Promise.all([
    verifyCompany(admin, agreement.client_id, 'agreement', agreement.id),
    verifyCompany(admin, agreement.subcontractor_id, 'agreement', agreement.id),
  ]);
  if (!client || !sub) return json({ error: 'not_found' }, 404);

  const decision = decideAgreement(client.results, sub.results);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: decision.status, checked_at: now, subcontractor_accepted_at: now };
  if (decision.status === 'blocked') update.blocked_findings = decision.findings;
  else Object.assign(update, { blocked_findings: [], confirmed_at: now });

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

  if (decision.status === 'confirmed' && agreement.kind === 'referral' && Number(agreement.amount_ex_vat) > 0) {
    const { data: sub } = await admin.from('subscriptions').select('plan, status').eq('company_id', agreement.subcontractor_id).maybeSingle();
    if (sub?.status === 'active' && (SUBSCRIBED_PLANS as readonly string[]).includes(sub.plan)) {
      const base = Number(agreement.amount_ex_vat);
      // Unique per agreement: a second confirmation cannot bill twice.
      await admin.from('project_commissions').insert({
        agreement_id: agreement.id,
        payer_id: PROJECT_COMMISSION_PAYER === 'architect' ? agreement.client_id : agreement.subcontractor_id,
        architect_id: agreement.client_id,
        contractor_id: agreement.subcontractor_id,
        base_ex_vat: base,
        rate: PROJECT_COMMISSION_RATE,
        amount_ex_vat: projectCommission(base),
        confirmed_at: now,
      });
    }
  }

  await logEvent(admin, {
    kind: 'agreement_checked',
    company_id: companyId,
    data: { agreement_id: agreement.id, status: decision.status, ...(decision.status === 'blocked' ? { findings: decision.findings } : {}) },
  });
  return json(decision);
});
