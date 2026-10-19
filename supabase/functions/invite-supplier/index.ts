// A contractor adds a usual supplier. The supplier becomes a favourite: it is offered on
// every request, even before it signs up.
// POST { supplier_id }                    picks a supplier from the suggestions.
// POST { name, city?, email?, phone? }    adds one that is not listed; the team contacts it.
// POST { remove: supplier_id }    (or DELETE { supplier_id }) removes a favourite.

import { logEvent } from '../_shared/events.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

const MAX_INVITES_PER_DAY = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);
  const { data: me } = await admin.from('companies').select('id, kind, name, language').eq('id', companyId).single();
  if (me?.kind !== 'contractor') return json({ error: 'contractors_only' }, 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; city?: string; phone?: string; supplier_id?: string; remove?: string };

  // Browsers only send POST to the functions; DELETE stays for older apps.
  const removing = req.method === 'DELETE' ? body.supplier_id : body.remove;
  if (req.method === 'DELETE' || body.remove !== undefined) {
    if (typeof removing !== 'string') return json({ error: 'not_found' }, 404);
    await admin.from('preferred_suppliers').delete().eq('contractor_id', companyId).eq('supplier_id', removing);
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Picked from the list of suppliers on the platform.
  if (typeof body.supplier_id === 'string') {
    const { data: picked } = await admin.from('companies').select('id, name').eq('id', body.supplier_id).eq('kind', 'supplier').maybeSingle();
    if (!picked) return json({ error: 'not_found' }, 404);
    await admin.from('preferred_suppliers').upsert({ contractor_id: companyId, supplier_id: picked.id });
    return json({ ok: true, supplier: picked, invited: false });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const city = typeof body.city === 'string' ? body.city.trim().slice(0, 80) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)) return json({ error: 'invalid_email' }, 400);
  if (name.length < 2) return json({ error: 'invalid_name' }, 400);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: invited }, { count: requested }] = await Promise.all([
    admin.from('supplier_invitations').select('id', { count: 'exact', head: true }).eq('contractor_id', companyId).gte('sent_at', since),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('kind', 'supplier_requested').eq('company_id', companyId).gte('occurred_at', since),
  ]);
  if ((invited ?? 0) + (requested ?? 0) >= MAX_INVITES_PER_DAY) return json({ error: 'too_many' }, 429);

  // No e-mail: the supplier is added under its name and the team looks up its address.
  if (!email) {
    const { data: placeholder, error } = await admin
      .from('companies')
      .insert({ kind: 'supplier', name, city: city || null, phone: phone || null, language: me.language })
      .select('id, name')
      .single();
    if (error || !placeholder) return json({ error: 'save_failed' }, 500);
    await admin.from('preferred_suppliers').upsert({ contractor_id: companyId, supplier_id: placeholder.id });
    await logEvent(admin, { kind: 'supplier_requested', company_id: companyId, data: { supplier_id: placeholder.id, name, city: city || null, phone: phone || null } });
    return json({ ok: true, supplier: placeholder, invited: false });
  }

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
  // The team contacts the supplier itself, so no invitation e-mail goes out.
  const { data: invite, error } = await admin
    .from('supplier_invitations')
    .insert({ contractor_id: companyId, email, name })
    .select('id')
    .single();
  if (error) return json({ error: 'already_invited' }, 409);
  const { data: placeholder } = await admin
    .from('companies')
    .insert({ kind: 'supplier', name, email, city: city || null, phone: phone || null, language: me.language })
    .select('id, name')
    .single();
  if (placeholder) {
    await admin.from('preferred_suppliers').upsert({ contractor_id: companyId, supplier_id: placeholder.id });
    await admin.from('supplier_invitations').update({ supplier_id: placeholder.id }).eq('id', invite.id);
    await logEvent(admin, { kind: 'supplier_requested', company_id: companyId, data: { supplier_id: placeholder.id, name, city: city || null, email, phone: phone || null } });
  }
  return json({ ok: true, supplier: placeholder, invited: false });
});
