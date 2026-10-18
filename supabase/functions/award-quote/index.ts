// The contractor picks one offer: it is marked awarded, the others not_selected,
// a numbered purchase order and the supplier's commission are recorded, and every
// supplier who answered is told by e-mail (the winner gets the order to confirm).

import { commissionFor } from '../_shared/commission.ts';
import { awardedMail, notSelectedMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { issueSupplierLink } from '../_shared/order-docs.ts';
import { orderAmounts } from '../_shared/orders.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { quote_id: quoteId } = (await req.json()) as { quote_id: string };
  const { data: quote } = await admin.from('quotes').select('id, request_id, supplier_id, status, total_ex_vat, commission_accepted_at').eq('id', quoteId).single();
  if (!quote) return json({ error: 'not_found' }, 404);
  const { data: request } = await admin
    .from('price_requests')
    .select('id, title, status, company_id')
    .eq('id', quote.request_id)
    .single();
  if (!request || request.company_id !== companyId) return json({ error: 'not_found' }, 404);
  if (request.status !== 'sent' || quote.status !== 'submitted') return json({ error: 'not_awardable' }, 409);

  const { data: flipped } = await admin
    .from('price_requests')
    .update({ status: 'awarded' })
    .eq('id', request.id)
    .eq('status', 'sent')
    .select('id');
  if (!flipped?.length) return json({ error: 'not_awardable' }, 409);

  await admin.from('quotes').update({ status: 'awarded' }).eq('id', quote.id);

  const { data: supplierTerms } = await admin.from('companies').select('commission_rate').eq('id', quote.supplier_id).single();
  const base = Number(quote.total_ex_vat ?? 0);
  const rate = Number(supplierTerms?.commission_rate ?? 0.05);
  const amounts = orderAmounts(base);
  const { data: order, error: orderError } = await admin
    .from('purchase_orders')
    .insert({
      quote_id: quote.id,
      request_id: request.id,
      contractor_id: companyId,
      supplier_id: quote.supplier_id,
      title: request.title,
      total_ex_vat: amounts.exVat,
      vat: amounts.vat,
      total_inc_vat: amounts.incVat,
      terms_accepted_at: quote.commission_accepted_at,
    })
    .select('id, number')
    .single();
  // The award stands either way; a missing order shows up in the back office.
  if (orderError) console.error('order', orderError.message);
  const orderUrl = order ? await issueSupplierLink(admin, order.id).catch((e) => (console.error(e), null)) : null;
  const { error: commissionError } = await admin.from('commissions').insert({
    order_id: order?.id ?? null,
    quote_id: quote.id,
    supplier_id: quote.supplier_id,
    contractor_id: companyId,
    base_ex_vat: base,
    rate,
    amount_ex_vat: commissionFor(base, rate),
  });
  // The award stands either way; a missing commission row shows up in the back office.
  if (commissionError) console.error('commission', commissionError.message);
  await logEvent(admin, {
    kind: 'quote_awarded',
    company_id: companyId,
    request_id: request.id,
    quote_id: quote.id,
    data: { supplier_id: quote.supplier_id, total_ex_vat: base, commission_rate: rate, order: order?.number ?? null },
  });
  await admin
    .from('quotes')
    .update({ status: 'not_selected' })
    .eq('request_id', request.id)
    .neq('id', quote.id)
    .in('status', ['invited', 'submitted']);

  const [{ data: contractor }, { data: answered }] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).single(),
    admin
      .from('quotes')
      .select('id, supplier:companies(email, language)')
      .eq('request_id', request.id)
      .not('submitted_at', 'is', null),
  ]);
  for (const q of answered ?? []) {
    const supplier = q.supplier as unknown as { email: string | null; language: Lang } | null;
    if (!supplier?.email) continue;
    const mail =
      q.id === quote.id
        ? awardedMail(
            supplier.language,
            supplier.email,
            contractor?.name ?? '',
            request.title,
            { base, rate, amount: commissionFor(base, rate) },
            // Without an order (it failed to be created), the back office follows up.
            order && orderUrl ? { number: order.number, url: orderUrl } : { number: '–', url: appUrl() },
          )
        : notSelectedMail(supplier.language, supplier.email, contractor?.name ?? '', request.title);
    await sendMail(mail).catch(console.error);
  }
  return json({ ok: true, order_id: order?.id ?? null });
});
