// Public endpoint behind the link in the supplier e-mail (no account, no JWT).
// GET  ?token=…  returns the request to price.
// POST { token, prices, delivery_fee, lead_time_days, valid_until, comment, accept_commission }
// submits the offer, { token, decline: true } declines it, and
// { token, question } asks the contractor something (relayed like a reply e-mail),
// and { token, stop_requests: true } unsubscribes the supplier from request e-mails.
// POST ?token=…&unsubscribe=1 is the one-click unsubscribe sent by mail clients.

import { offerTotalExVat, SUPPLIER_COMMISSION_ACTIVE } from '../_shared/commission.ts';
import { newQuoteMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { adminClient, appUrl, corsHeaders, json } from '../_shared/supabase.ts';
import { MAX_BODY, relayMessage } from '../_shared/relay.ts';
import { hashToken } from '../_shared/tokens.ts';

type Admin = ReturnType<typeof adminClient>;

const QUOTE_COLUMNS = 'id, request_id, supplier_id, status, token_expires_at, delivery_fee, lead_time_days, valid_until, comment, commission_accepted_at';

/** The e-mailed link, or a short link the supplier opened from its space. */
async function findQuote(admin: Admin, token: string | null) {
  if (!token || token.length < 20) return null;
  const hash = await hashToken(token);
  const { data } = await admin.from('quotes').select(QUOTE_COLUMNS).eq('token_hash', hash).maybeSingle();
  if (data) return new Date(data.token_expires_at) < new Date() ? null : data;
  const { data: link } = await admin.from('quote_links').select('quote_id, expires_at').eq('token_hash', hash).maybeSingle();
  if (!link || new Date(link.expires_at) < new Date()) return null;
  const { data: quote } = await admin.from('quotes').select(QUOTE_COLUMNS).eq('id', link.quote_id).maybeSingle();
  return quote;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();

  if (req.method === 'GET') {
    const quote = await findQuote(admin, new URL(req.url).searchParams.get('token'));
    if (!quote) return json({ error: 'invalid_link' }, 404);
    const [{ data: request }, { data: items }, { data: supplier }, { data: prices }, { data: messages }] = await Promise.all([
      admin
        .from('price_requests')
        .select('title, postal_code, city, needed_by, reply_by, sent_at, fulfilment, note, status, company:companies(name, verified_at, vat_number, street, postal_code, city)')
        .eq('id', quote.request_id)
        .single(),
      admin.from('request_items').select('id, label, quantity, unit').eq('request_id', quote.request_id).order('position'),
      admin.from('companies').select('name, language, commission_rate, requests_stopped_at').eq('id', quote.supplier_id).single(),
      admin.from('quote_items').select('item_id, unit_price').eq('quote_id', quote.id),
      admin
        .from('quote_messages')
        .select('author, body, relayed_body, created_at')
        .eq('quote_id', quote.id)
        .not('relayed_at', 'is', null)
        .order('created_at'),
    ]);
    return json({
      quote: {
        status: quote.status,
        delivery_fee: quote.delivery_fee,
        lead_time_days: quote.lead_time_days,
        valid_until: quote.valid_until,
        comment: quote.comment,
        commission_accepted: Boolean(quote.commission_accepted_at),
        prices: Object.fromEntries((prices ?? []).map((p) => [p.item_id, Number(p.unit_price)])),
      },
      request,
      items,
      supplier: supplier && {
        name: supplier.name,
        language: supplier.language,
        // null while suppliers answer for free.
        commission_rate: SUPPLIER_COMMISSION_ACTIVE ? Number(supplier.commission_rate) : null,
        requests_stopped: Boolean(supplier.requests_stopped_at),
      },
      // The supplier sees their own words, and the contractor's answers as relayed to them.
      messages: (messages ?? []).map((m) => ({
        author: m.author,
        text: m.author === 'supplier' ? m.body : m.relayed_body,
        created_at: m.created_at,
      })),
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // One-click unsubscribe from the mail client (List-Unsubscribe-Post, RFC 8058).
  const query = new URL(req.url).searchParams;
  if (query.get('unsubscribe') === '1') {
    const target = await findQuote(admin, query.get('token'));
    if (!target) return json({ error: 'invalid_link' }, 404);
    await admin.from('companies').update({ requests_stopped_at: new Date().toISOString() }).eq('id', target.supplier_id).is('requests_stopped_at', null);
    await logEvent(admin, { kind: 'supplier_unsubscribed', company_id: target.supplier_id, quote_id: target.id, data: { via: 'one_click' } });
    return json({ ok: true });
  }

  const body = await req.json();
  const quote = await findQuote(admin, body.token);
  if (!quote) return json({ error: 'invalid_link' }, 404);

  // Works on any link, even once the request is closed.
  if (body.stop_requests === true) {
    await admin.from('companies').update({ requests_stopped_at: new Date().toISOString() }).eq('id', quote.supplier_id).is('requests_stopped_at', null);
    await logEvent(admin, { kind: 'supplier_unsubscribed', company_id: quote.supplier_id, quote_id: quote.id });
    return json({ ok: true });
  }

  const { data: request } = await admin
    .from('price_requests')
    .select('id, title, status, company_id')
    .eq('id', quote.request_id)
    .single();
  if (!request || request.status !== 'sent' || !['invited', 'submitted'].includes(quote.status)) {
    return json({ error: 'closed' }, 409);
  }

  if (typeof body.question === 'string') {
    if (!body.question.trim() || body.question.length > MAX_BODY) return json({ error: 'invalid_body' }, 400);
    const result = await relayMessage(admin, { quoteId: quote.id, author: 'supplier', channel: 'app', body: body.question });
    return json(result);
  }

  if (body.decline === true) {
    await admin.from('quotes').update({ status: 'declined' }).eq('id', quote.id);
    await logEvent(admin, { kind: 'quote_declined', company_id: quote.supplier_id, request_id: request.id, quote_id: quote.id });
    return json({ ok: true });
  }

  // Offers are made on the platform's terms: a commission is due if this one is awarded.
  if (SUPPLIER_COMMISSION_ACTIVE && !quote.commission_accepted_at && body.accept_commission !== true) {
    return json({ error: 'commission_not_accepted' }, 400);
  }

  const { data: items } = await admin.from('request_items').select('id, quantity').eq('request_id', request.id);
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

  const quantities = new Map((items ?? []).map((i) => [i.id, Number(i.quantity)]));
  const totalExVat = offerTotalExVat(
    rows.map((r) => ({ quantity: quantities.get(r.item_id)!, unitPrice: r.unit_price })),
    deliveryFee,
  );

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
      total_ex_vat: totalExVat,
      commission_accepted_at: quote.commission_accepted_at ?? (SUPPLIER_COMMISSION_ACTIVE ? new Date().toISOString() : null),
    })
    .eq('id', quote.id);
  await logEvent(admin, {
    kind: 'quote_submitted',
    company_id: quote.supplier_id,
    request_id: request.id,
    quote_id: quote.id,
    data: { total_ex_vat: totalExVat, lead_time_days: leadTime, update: !firstSubmission },
  });

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
