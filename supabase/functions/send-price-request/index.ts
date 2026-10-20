// Sends a draft price request. The contractor chose the suppliers (supplier_ids),
// or BatiNode picks up to 5 suppliers of the region (choice: 'batinode'), or both:
// the contractor's own, completed by BatiNode up to 5 (choice: 'mix'). When BatiNode
// finds too few, the BatiNode team is told to complete the request.
// One quote row and one e-mail with a personal reply link per supplier.

import { REPLY_HOURS, sendMail } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { AUTO_SUPPLIERS, inviteSuppliers, pickSuppliers } from '../_shared/invitations.ts';
import { canSendPriceRequest, effectivePlan, monthStart, type Plan } from '../_shared/plans.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as { request_id?: string; supplier_ids?: string[]; choice?: string };
  const choice = body.choice === 'batinode' || body.choice === 'mix' ? body.choice : 'own';
  const auto = choice !== 'own';
  const uniqueSuppliers = choice === 'batinode' ? [] : [...new Set((Array.isArray(body.supplier_ids) ? body.supplier_ids : []).filter((s) => typeof s === 'string'))];
  if (choice === 'mix' && (uniqueSuppliers.length < 1 || uniqueSuppliers.length > AUTO_SUPPLIERS)) return json({ error: 'no_supplier' }, 400);
  if (typeof body.request_id !== 'string') return json({ error: 'not_found' }, 404);

  const { data: request } = await admin
    .from('price_requests')
    .select('id, company_id, title, category_id, postal_code, city, needed_by, reply_by, fulfilment, status')
    .eq('id', body.request_id)
    .single();
  if (!request || request.company_id !== companyId) return json({ error: 'not_found' }, 404);
  if (request.status !== 'draft') return json({ error: 'already_sent' }, 409);

  const [{ data: sub }, { count: sentThisMonth }] = await Promise.all([
    admin.from('subscriptions').select('plan, status, trial_ends_at, provider_subscription_id').eq('company_id', companyId).single(),
    admin
      .from('price_requests')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('sent_at', monthStart(new Date()).toISOString()),
  ]);
  const plan: Plan = effectivePlan(sub);
  const check = canSendPriceRequest(plan, sentThisMonth ?? 0, auto ? AUTO_SUPPLIERS : uniqueSuppliers.length);
  if (!check.ok) return json({ error: check.reason, limit: check.limit, plan }, 403);

  if (uniqueSuppliers.length) {
    // Only suppliers that really cover this category and postal code, or the contractor's favourites.
    const [{ data: coverage }, { data: favourites }] = await Promise.all([
      (request.category_id === null
        ? admin.from('supplier_coverage').select('supplier_id, postal_prefix')
        : admin.from('supplier_coverage').select('supplier_id, postal_prefix').eq('category_id', request.category_id)
      ).in('supplier_id', uniqueSuppliers),
      admin.from('preferred_suppliers').select('supplier_id').eq('contractor_id', companyId).in('supplier_id', uniqueSuppliers),
    ]);
    const allowed = new Set([
      ...(coverage ?? []).filter((c) => request.postal_code.startsWith(c.postal_prefix)).map((c) => c.supplier_id),
      ...(favourites ?? []).map((f) => f.supplier_id),
    ]);
    if (allowed.size !== uniqueSuppliers.length) return json({ error: 'supplier_not_covering' }, 400);
  }

  // Flip to `sent` first so a double tap cannot send twice. Suppliers get 48 hours from now.
  const sentAt = new Date();
  const replyBy = new Date(sentAt.getTime() + REPLY_HOURS * 3_600_000).toISOString().slice(0, 10);
  const { data: flipped } = await admin
    .from('price_requests')
    .update({ status: 'sent', sent_at: sentAt.toISOString(), reply_by: replyBy, supplier_choice: choice })
    .eq('id', request.id)
    .eq('status', 'draft')
    .select('id');
  if (!flipped?.length) return json({ error: 'already_sent' }, 409);

  const sent = { ...request, reply_by: replyBy };
  // The contractor's own suppliers first, then BatiNode's picks for the places left.
  const own = await inviteSuppliers(admin, sent, uniqueSuppliers);
  const picked = auto ? await pickSuppliers(admin, sent, AUTO_SUPPLIERS - own.sent.length) : [];
  const found = await inviteSuppliers(admin, sent, picked);
  const chosen = [...uniqueSuppliers, ...picked];
  const result = { sent: [...own.sent, ...found.sent], failed: [...own.failed, ...found.failed] };

  // BatiNode promised 5 suppliers: the team completes the request by hand.
  const missing = auto ? AUTO_SUPPLIERS - result.sent.length : 0;
  if (missing > 0) {
    const where = [request.postal_code, request.city].filter(Boolean).join(' ');
    await sendMail({
      to: Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be',
      subject: `Demande à compléter : ${missing} fournisseur${missing > 1 ? 's' : ''} à trouver (${where})`,
      text: `La demande « ${request.title} » (${where}) a été confiée à BatiNode. ${result.sent.length} fournisseur(s) trouvé(s) sur ${AUTO_SUPPLIERS}.\nComplétez-la dans l'espace Admin : ${appUrl()}/admin`,
      html: `<p>La demande « ${escape(request.title)} » (${escape(where)}) a été confiée à BatiNode. ${result.sent.length} fournisseur(s) trouvé(s) sur ${AUTO_SUPPLIERS}.</p><p><a href="${appUrl()}/admin">Compléter dans l'espace Admin</a></p>`,
    }).catch((e) => console.error(e));
  }

  await logEvent(admin, {
    kind: 'request_sent',
    company_id: companyId,
    request_id: request.id,
    data: { plan, choice, suppliers: chosen.length, failed: result.failed.length, missing, category_id: request.category_id, postal_code: request.postal_code },
  });
  return json({ sent: result.sent.length, failed: result.failed, choice, target: auto ? AUTO_SUPPLIERS : chosen.length });
});

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
