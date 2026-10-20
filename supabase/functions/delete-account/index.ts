// Deletes the signed-in user's account, from the app (App Store and Google Play require it).
// POST { confirm: true }
// The last member of a company takes the company with them: its paid plan is cancelled on
// Stripe, its files and logo are removed, and the company row is deleted. When partners
// still need its rows for their accounting (orders, commissions, offers), the row stays,
// stripped of every contact detail and hidden from all lists.

import { logEvent } from '../_shared/events.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, corsHeaders, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== true) return json({ error: 'not_confirmed' }, 400);

  const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
  const companyId = profile?.company_id as string | null | undefined;
  let company: 'none' | 'kept' | 'deleted' | 'anonymised' = 'none';

  if (companyId) {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId).neq('id', user.id);
    if (count) company = 'kept';
    else {
      const stopped = await cancelPlan(admin, companyId);
      if (!stopped) return json({ error: 'billing_failed' }, 502);
      await removeFiles(admin, companyId);
      company = await removeCompany(admin, companyId);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('delete user', error.message);
    return json({ error: 'delete_failed' }, 500);
  }
  await logEvent(admin, { kind: 'account_deleted', company_id: company === 'deleted' ? null : (companyId ?? null), data: { company } });
  return json({ ok: true });
});

/** Stops the paid plan on Stripe so nothing is charged after deletion. False if Stripe refused. */
async function cancelPlan(admin: Admin, companyId: string): Promise<boolean> {
  const { data: sub } = await admin.from('subscriptions').select('provider_subscription_id').eq('company_id', companyId).maybeSingle();
  const id = sub?.provider_subscription_id as string | null | undefined;
  if (!id) return true;
  const stripe = stripeClient();
  if (!stripe) return false;
  try {
    await stripe.subscriptions.cancel(id);
    return true;
  } catch (e) {
    // Already cancelled, or made with other keys: nothing left to charge.
    const code = (e as { code?: string }).code;
    if (code === 'resource_missing') return true;
    console.error('stripe cancel', e);
    return false;
  }
}

async function removeFolder(admin: Admin, bucket: string, folder: string): Promise<void> {
  const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
  if (paths.length) await admin.storage.from(bucket).remove(paths);
}

async function removeFiles(admin: Admin, companyId: string): Promise<void> {
  await Promise.all([removeFolder(admin, 'company-files', companyId), removeFolder(admin, 'logos', companyId)]);
}

async function removeCompany(admin: Admin, companyId: string): Promise<'deleted' | 'anonymised'> {
  const { error } = await admin.from('companies').delete().eq('id', companyId);
  if (!error) return 'deleted';
  // 23503: orders, commissions or offers still point at it.
  if (error.code !== '23503') console.error('delete company', error.message);

  await Promise.all([
    admin.from('opportunities').delete().eq('company_id', companyId),
    admin.from('opportunity_responses').delete().eq('company_id', companyId),
    admin.from('conversations').delete().or(`company_a.eq.${companyId},company_b.eq.${companyId}`),
    admin.from('company_files').delete().eq('company_id', companyId),
    admin.from('preferred_suppliers').delete().or(`contractor_id.eq.${companyId},supplier_id.eq.${companyId}`),
    admin.from('supplier_coverage').delete().eq('supplier_id', companyId),
    admin.from('company_trades').delete().eq('company_id', companyId),
    admin.from('subscriptions').delete().eq('company_id', companyId),
  ]);
  const now = new Date().toISOString();
  await admin
    .from('companies')
    .update({
      name: 'Entreprise supprimée',
      email: null,
      quote_email: null,
      contact_name: null,
      phone: null,
      website: null,
      street: null,
      logo_url: null,
      referral_code: null,
      news_emails: false,
      requests_stopped_at: now,
      verification_status: 'rejected',
      deleted_at: now,
    })
    .eq('id', companyId);
  return 'anonymised';
}
