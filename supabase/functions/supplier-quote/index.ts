// Public endpoint behind the link in the supplier e-mail (no account, no JWT).
// GET  ?token=…  returns the request to price.
// POST { token, prices, delivery_fee, lead_time_days, valid_until, comment } submits the offer,
// or { token, decline: true } declines it.

import { newQuoteMail, sendMail, type Lang } from '../_shared/email.ts';
import { adminClient, appUrl, corsHeaders, json } from '../_shared/supabase.ts';
import { hashToken } from '../_shared/tokens.ts';

type Admin = ReturnType<typeof adminClient>;

async function findQuote(admin: Admin, token: string | null) {
  if (!token || token.length < 20) return null;
  const { data } = await admin
    .from('quotes')
    .select('id, request_id, supplier_id, status, token_expires_at, delivery_fee, lead_time_days, valid_until, comment')
    .eq('token_hash', await hashToken(token))
    .maybeSingle();
  if (!data || new Date(data.token_expires_at) < new Date()) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();

  if (req.method === 'GET') {
    const quote = await findQuote(admin, new URL(req.url).searchParams.get('token'));
    if (!quote) return json({ error: 'invalid_link' }, 404);
    const [{ data: request }, { data: items }, { data: supplier }, { data: prices }] = await Promise.all([
      admin
        .from('price_requests')
        .select('title, postal_code, city, needed_by, reply_by, fulfilment, note, status, company:companies(name, verified_at)')
        .eq('id', quote.request_id)
        .single(),
      admin.from('request_items').select('id, label, quantity, unit').eq('request_id', quote.request_id).order('position'),
      admin.from('companies').select('name, language').eq('id', quote.supplier_id).single(),
      admin.from('quote_items').select('item_id, unit_price').eq('quote_id', quote.id),
    ]);
    return json({
      quote: {
        status: quote.status,
        delivery_fee: quote.delivery_fee,
        lead_time_days: quote.lead_time_days,
        valid_until: quote.valid_until,
        comment: quote.comment,
        prices: Object.fromEntries((prices ?? []).map((p) => [p.item_id, Number(p.unit_price)])),
      },
      request,
      items,
      supplier,
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = await req.json();
  const quote = await findQuote(admin, body.token);
  if (!quote) return json({ error: 'invalid_link' }, 404);

  const { data: request } = await admin
    .from('price_requests')
    .select('id, title, status, company_id')
    .eq('id', quote.request_id)
    .single();
  if (!request || request.status !== 'sent' || !['invited', 'submitted'].includes(quote.status)) {
    return json({ error: 'closed' }, 409);
  }

  if (body.decline === true) {
    await admin.from('quotes').update({ status: 'declined' }).eq('id', quote.id);
    return json({ ok: true });
  }

  const { data: items } = await admin.from('request_items').select('id').eq('request_id', request.id);
  const prices = (body.prices ?? {}) as Record<string, unknown>;
  const rows = (items ?? []).map((i) => ({ quote_id: quote.id, item_id: i.id, unit_price: Number(prices[i.id]) }));
  if (!rows.length || rows.some((r) => !Number.isFinite(r.unit_price) || r.unit_price < 0)) {
    return json({ error: 'missing_prices' }, 400);
  }
  const deliveryFee = Number(body.delivery_fee ?? 0);
  const leadTime = Number(body.lead_time_days);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isInteger(leadTime) || leadTime < 0) {
    return json({ error: 'invalid_terms' }, 400);
  }

  const { error: itemsError } = await admin.from('quote_items').upsert(rows);
  if (itemsError) return json({ error: 'save_failed' }, 500);
  const firstSubmission = quote.status === 'invited';
  await admin
    .from('quotes')
    .update({
      status: 'submitted',
      delivery_fee: deliveryFee,
      lead_time_days: leadTime,
      valid_until: typeof body.valid_until === 'string' && body.valid_until ? body.valid_until : null,
      comment: typeof body.comment === 'string' ? body.comment.slice(0, 2000) : null,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', quote.id);

  if (firstSubmission) {
    const [{ data: contractor }, { data: supplier }] = await Promise.all([
      admin.from('companies').select('email, language').eq('id', request.company_id).single(),
      admin.from('companies').select('name').eq('id', quote.supplier_id).single(),
    ]);
    if (contractor?.email) {
      await sendMail(
        newQuoteMail(contractor.language as Lang, contractor.email, supplier?.name ?? '', request.title, `${appUrl()}/demande/${request.id}`),
      ).catch(console.error);
    }
  }
  return json({ ok: true });
});
