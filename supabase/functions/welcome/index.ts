// Called once by the app right after sign-up: starts the contractor's Premium trial,
// links a supplier to the contractors that invited it, and sends the welcome e-mail.
// Safe to call twice: everything is guarded by the 'welcome' lifecycle row.

import { welcomeMail, type Kind } from '../_shared/growth-mail.ts';
import { sendMail, type Lang } from '../_shared/email.ts';
import { TRIAL_DAYS, TRIAL_PLAN } from '../_shared/plans.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

/** A company that signed up with a referral code tries Premium for a month. */
const REFERRED_TRIAL_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { error: first } = await admin.from('lifecycle_messages').insert({ company_id: companyId, kind: 'welcome' });
  if (first) return json({ ok: true, already: true });

  const { data: company } = await admin
    .from('companies')
    .select('id, kind, email, quote_email, language, referred_by')
    .eq('id', companyId)
    .single();
  if (!company) return json({ error: 'not_found' }, 404);
  const kind = company.kind as Kind;

  let trialDays = 0;
  if (kind === 'contractor') {
    trialDays = company.referred_by ? REFERRED_TRIAL_DAYS : TRIAL_DAYS;
    await admin
      .from('subscriptions')
      .update({ plan: TRIAL_PLAN, status: 'active', trial_ends_at: new Date(Date.now() + trialDays * 86_400_000).toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('plan', 'free')
      .is('provider_subscription_id', null);
  }

  if (kind === 'supplier') {
    // Contractors that invited this address keep it as a favourite.
    const addresses = [company.email, company.quote_email].filter(Boolean).map((e: string) => e.toLowerCase());
    const { data: invites } = await admin.from('supplier_invitations').select('id, contractor_id, supplier_id').in('email', addresses);
    for (const inv of invites ?? []) {
      await admin.from('supplier_invitations').update({ supplier_id: companyId }).eq('id', inv.id);
      await admin.from('preferred_suppliers').upsert({ contractor_id: inv.contractor_id, supplier_id: companyId });
      // The record created at invitation time stops receiving new requests.
      if (inv.supplier_id && inv.supplier_id !== companyId) {
        await admin.from('preferred_suppliers').delete().eq('contractor_id', inv.contractor_id).eq('supplier_id', inv.supplier_id);
      }
    }
  }

  const path = kind === 'contractor' ? '/nouvelle' : kind === 'architect' ? '/annonce/nouvelle' : '/';
  if (company.email) {
    await sendMail(welcomeMail(company.language as Lang, company.email, kind, `${appUrl()}${path}`, trialDays)).catch(console.error);
  }
  return json({ ok: true, trial_days: trialDays });
});
