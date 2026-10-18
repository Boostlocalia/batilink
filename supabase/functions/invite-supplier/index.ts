// A contractor adds its usual supplier by e-mail. The supplier becomes a favourite:
// it is offered on every request, even before it signs up, and it is invited to
// create its free space (with the contractor's referral code).
// POST { email, name }    DELETE { supplier_id } removes a favourite.

import { supplierInviteMail } from '../_shared/growth-mail.ts';
import { sendMail, type Lang } from '../_shared/email.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

const MAX_INVITES_PER_DAY = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);
  const { data: me } = await admin.from('companies').select('id, kind, name, language, referral_code').eq('id', companyId).single();
  if (me?.kind !== 'contractor') return json({ error: 'contractors_only' }, 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; supplier_id?: string };

  if (req.method === 'DELETE') {
    if (typeof body.supplier_id !== 'string') return json({ error: 'not_found' }, 404);
    await admin.from('preferred_suppliers').delete().eq('contractor_id', companyId).eq('supplier_id', body.supplier_id);
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ error: 'invalid_email' }, 400);
  if (name.length < 2) return json({ error: 'invalid_name' }, 400);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from('supplier_invitations').select('id', { count: 'exact', head: true }).eq('contractor_id', companyId).gte('sent_at', since);
  if ((count ?? 0) >= MAX_INVITES_PER_DAY) return json({ error: 'too_many' }, 429);

  // Already on the platform: just keep it as a favourite.
  const [{ data: byEmail }, { data: byQuoteEmail }] = await Promise.all([
    admin.from('companies').select('id, name').eq('kind', 'supplier').eq('email', email).limit(1),
    admin.from('companies').select('id, name').eq('kind', 'supplier').eq('quote_email', email).limit(1),
  ]);
  const existing = byQuoteEmail?.[0] ?? byEmail?.[0] ?? null;
  if (existing) {
    await admin.from('preferred_suppliers').upsert({ contractor_id: companyId, supplier_id: existing.id });
    return json({ ok: true, supplier: existing, invited: false });
  }

  // Not yet: a supplier record without VAT receives the requests by e-mail until
  // the supplier signs up (welcome links the new company to this contractor).
  const { data: invite, error } = await admin
    .from('supplier_invitations')
    .insert({ contractor_id: companyId, email, name })
    .select('id')
    .single();
  if (error) return json({ error: 'already_invited' }, 409);
  const { data: placeholder } = await admin
    .from('companies')
    .insert({ kind: 'supplier', name, email, language: me.language })
    .select('id, name')
    .single();
  if (placeholder) {
    await admin.from('preferred_suppliers').upsert({ contractor_id: companyId, supplier_id: placeholder.id });
    await admin.from('supplier_invitations').update({ supplier_id: placeholder.id }).eq('id', invite.id);
  }
  const url = `${appUrl()}/bienvenue?profil=supplier&ref=${encodeURIComponent(me.referral_code ?? '')}`;
  await sendMail(supplierInviteMail(me.language as Lang, email, me.name, url)).catch(console.error);
  return json({ ok: true, supplier: placeholder, invited: true });
});
