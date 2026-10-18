// Monthly job (x-cron-secret): bills each supplier the commission still due on
// orders that were not paid through BatiLink, and e-mails a secure payment link.
// A commission is billed once the sale is proven: delivery confirmed by the
// contractor, a matching invoice, or 45 days after the supplier confirmed.
//
// GET ?pay=<token> is the link in that e-mail: it opens a fresh Stripe payment
// page for the bill (Stripe pages expire, the e-mail link does not).

import { commissionBillMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { BELGIAN_VAT, toCents } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';
import { hashToken, newToken } from '../_shared/tokens.ts';

type Admin = ReturnType<typeof adminClient>;
const round2 = (n: number) => Math.round(n * 100) / 100;
const functionsUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

async function payLink(admin: Admin, token: string | null): Promise<Response> {
  const stripe = stripeClient();
  if (!stripe || !token || token.length < 20) return new Response('Lien invalide / Ongeldige link', { status: 404 });
  const { data: bill } = await admin
    .from('commission_bills')
    .select('id, number, supplier_id, amount_inc_vat, status')
    .eq('pay_token_hash', await hashToken(token))
    .maybeSingle();
  if (!bill) return new Response('Lien invalide / Ongeldige link', { status: 404 });
  if (bill.status !== 'open') return Response.redirect(`${appUrl()}/?commission=payee`, 303);
  const { data: supplier } = await admin.from('companies').select('email, language').eq('id', bill.supplier_id).single();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale: supplier?.language === 'nl' ? 'nl' : 'fr',
    customer_email: supplier?.email ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: toCents(Number(bill.amount_inc_vat)), product_data: { name: `Commission ${bill.number}` } } }],
    payment_intent_data: { description: `Commission ${bill.number}`, metadata: { commission_bill_id: bill.id } },
    metadata: { commission_bill_id: bill.id },
    success_url: `${appUrl()}/?commission=payee`,
    cancel_url: `${appUrl()}/`,
  });
  await admin.from('payments').insert({
    purpose: 'commission',
    company_id: bill.supplier_id,
    commission_bill_id: bill.id,
    amount_cents: toCents(Number(bill.amount_inc_vat)),
    stripe_checkout_session_id: session.id,
  });
  return Response.redirect(session.url!, 303);
}

Deno.serve(async (req) => {
  const admin = adminClient();
  if (req.method === 'GET') return payLink(admin, new URL(req.url).searchParams.get('pay'));
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET') || !Deno.env.get('CRON_SECRET')) return json({ error: 'unauthorized' }, 401);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Bill the previous month.
  const month = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const proofCutoff = new Date(now.getTime() - 45 * 86_400_000).toISOString();

  const { data: due } = await admin
    .from('commissions')
    .select('id, supplier_id, amount_ex_vat, collected_inc_vat, order:purchase_orders(id, status, delivered_at, supplier_confirmed_at, documents:order_documents(kind, check_status))')
    .eq('status', 'pending')
    .is('bill_id', null)
    .lt('awarded_at', monthStart.toISOString())
    .limit(5000);

  type Row = NonNullable<typeof due>[number];
  const proven = (c: Row) => {
    const o = c.order as unknown as {
      status: string;
      delivered_at: string | null;
      supplier_confirmed_at: string | null;
      documents: { kind: string; check_status: string | null }[];
    } | null;
    if (!o || o.status === 'cancelled' || o.status === 'awaiting_supplier') return false;
    return Boolean(o.delivered_at) || o.documents.some((d) => d.kind === 'invoice' && d.check_status === 'matched') || (o.supplier_confirmed_at !== null && o.supplier_confirmed_at < proofCutoff);
  };

  const bySupplier = new Map<string, Row[]>();
  for (const c of due ?? []) {
    if (!proven(c)) continue;
    bySupplier.set(c.supplier_id, [...(bySupplier.get(c.supplier_id) ?? []), c]);
  }

  let billed = 0;
  for (const [supplierId, rows] of bySupplier) {
    // What is left after commission already taken on online payments.
    const exVat = round2(rows.reduce((s, c) => s + Math.max(0, Number(c.amount_ex_vat) - Number(c.collected_inc_vat) / (1 + BELGIAN_VAT)), 0));
    if (exVat < 1) continue;
    const vat = round2(exVat * BELGIAN_VAT);
    const token = newToken();
    const { data: bill, error } = await admin
      .from('commission_bills')
      .insert({ supplier_id: supplierId, month, amount_ex_vat: exVat, vat, amount_inc_vat: round2(exVat + vat), pay_token_hash: await hashToken(token) })
      .select('id, number')
      .single();
    if (error || !bill) continue; // Already billed for that month.
    const number = bill.number as string;
    await admin.from('commissions').update({ status: 'invoiced', invoiced_at: now.toISOString(), bill_id: bill.id, invoice_number: number }).in('id', rows.map((c) => c.id));
    const { data: supplier } = await admin.from('companies').select('email, language').eq('id', supplierId).single();
    if (supplier?.email) {
      await sendMail(
        commissionBillMail(supplier.language as Lang, supplier.email, { number, month: month.slice(0, 7), exVat, incVat: round2(exVat + vat), orders: rows.length }, `${functionsUrl()}/bill-commissions?pay=${token}`),
      ).catch(console.error);
    }
    await logEvent(admin, { kind: 'commission_billed', company_id: supplierId, data: { number, ex_vat: exVat, orders: rows.length } });
    billed++;
  }
  return json({ billed });
});
