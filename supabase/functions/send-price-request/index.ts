// Sends a draft price request to the chosen suppliers: one quote row and one
// e-mail with a personal reply link per supplier.

import { invitationMail, REPLY_HOURS, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { relayAddress } from '../_shared/relay-address.ts';
import { canSendPriceRequest, monthStart, type Plan } from '../_shared/plans.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { hashToken, newToken, tokenExpiry } from '../_shared/tokens.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { request_id: requestId, supplier_ids: supplierIds } = (await req.json()) as {
    request_id: string;
    supplier_ids: string[];
  };
  const uniqueSuppliers = [...new Set(supplierIds ?? [])];

  const { data: request } = await admin
    .from('price_requests')
    .select('id, company_id, title, category_id, postal_code, city, needed_by, reply_by, fulfilment, status')
    .eq('id', requestId)
    .single();
  if (!request || request.company_id !== companyId) return json({ error: 'not_found' }, 404);
  if (request.status !== 'draft') return json({ error: 'already_sent' }, 409);

  const [{ data: sub }, { count: sentThisMonth }] = await Promise.all([
    admin.from('subscriptions').select('plan, status').eq('company_id', companyId).single(),
    admin
      .from('price_requests')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('sent_at', monthStart(new Date()).toISOString()),
  ]);
  const plan: Plan = sub?.status === 'active' ? (sub.plan as Plan) : 'free';
  const check = canSendPriceRequest(plan, sentThisMonth ?? 0, uniqueSuppliers.length);
  if (!check.ok) return json({ error: check.reason, limit: check.limit, plan }, 403);

  // Only suppliers that really cover this category and postal code, or the contractor's favourites.
  const [{ data: coverage }, { data: favourites }] = await Promise.all([
    admin
      .from('supplier_coverage')
      .select('supplier_id, postal_prefix')
      .eq('category_id', request.category_id)
      .in('supplier_id', uniqueSuppliers),
    admin.from('preferred_suppliers').select('supplier_id').eq('contractor_id', companyId).in('supplier_id', uniqueSuppliers),
  ]);
  const allowed = new Set([
    ...(coverage ?? []).filter((c) => request.postal_code.startsWith(c.postal_prefix)).map((c) => c.supplier_id),
    ...(favourites ?? []).map((f) => f.supplier_id),
  ]);
  if (allowed.size !== uniqueSuppliers.length) return json({ error: 'supplier_not_covering' }, 400);

  // Flip to `sent` first so a double tap cannot send twice. Suppliers get 48 hours from now.
  const sentAt = new Date();
  const replyBy = new Date(sentAt.getTime() + REPLY_HOURS * 3_600_000).toISOString().slice(0, 10);
  const { data: flipped } = await admin
    .from('price_requests')
    .update({ status: 'sent', sent_at: sentAt.toISOString(), reply_by: replyBy })
    .eq('id', request.id)
    .eq('status', 'draft')
    .select('id');
  if (!flipped?.length) return json({ error: 'already_sent' }, 409);

  const [{ data: items }, { data: contractor }, { data: suppliers }] = await Promise.all([
    admin.from('request_items').select('label, quantity, unit').eq('request_id', request.id).order('position'),
    admin.from('companies').select('name, verified_at').eq('id', companyId).single(),
    admin.from('companies').select('id, email, quote_email, language, commission_rate').in('id', uniqueSuppliers),
  ]);

  const failed: string[] = [];
  for (const supplier of suppliers ?? []) {
    const token = newToken();
    const { data: quote, error } = await admin
      .from('quotes')
      .insert({
        request_id: request.id,
        supplier_id: supplier.id,
        token_hash: await hashToken(token),
        token_expires_at: tokenExpiry(),
      })
      .select('reply_key')
      .single();
    if (error || !quote || !(supplier.quote_email ?? supplier.email)) {
      failed.push(supplier.id);
      continue;
    }
    try {
      await sendMail(
        invitationMail({
          lang: supplier.language as Lang,
          to: supplier.quote_email ?? supplier.email,
          contractor: contractor?.name ?? '',
          contractorVerified: Boolean(contractor?.verified_at),
          title: request.title,
          postalCode: request.postal_code,
          city: request.city,
          items: items ?? [],
          neededBy: request.needed_by,
          replyBy,
          delivery: request.fulfilment === 'delivery',
          url: `${appUrl()}/offre/${token}`,
          commissionRate: Number(supplier.commission_rate),
          replyTo: relayAddress('supplier', quote.reply_key, Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined),
        }),
      );
    } catch (e) {
      console.error(e);
      failed.push(supplier.id);
    }
  }

  await logEvent(admin, {
    kind: 'request_sent',
    company_id: companyId,
    request_id: request.id,
    data: { plan, suppliers: uniqueSuppliers.length, failed: failed.length, category_id: request.category_id, postal_code: request.postal_code },
  });
  return json({ sent: (suppliers?.length ?? 0) - failed.length, failed });
});
