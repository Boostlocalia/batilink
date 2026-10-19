// Monthly job (x-cron-secret): bills each supplier the commission on the sales
// made through Batinode, and e-mails the statement with a secure payment link.
// Contractors pay suppliers directly; a commission is billed once the sale is
// proven (delivery confirmed by the contractor, a matching invoice, proof of
// payment, or 45 days after the supplier confirmed). Unproven ones wait for the
// next month. Project commissions (an architect's project confirmed by a
// subscribed contractor) go on the payer's bill of the same month.
//
// GET ?pay=<token> is the link in that e-mail: it opens a fresh Stripe payment
// page for the bill (Stripe pages expire, the e-mail link does not).

import { commissionBillMail, sendMail, type BillLine, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { orderAmounts, toCents } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';
import { hashToken, newToken } from '../_shared/tokens.ts';

type Admin = ReturnType<typeof adminClient>;
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
    .select(
      'id, supplier_id, base_ex_vat, amount_ex_vat, order:purchase_orders(number, title, status, delivered_at, payment_reported_at, supplier_confirmed_at, contractor:companies!purchase_orders_contractor_id_fkey(name), documents:order_documents(kind, check_status))',
    )
    .eq('status', 'pending')
    .is('bill_id', null)
    .lt('awarded_at', monthStart.toISOString())
    .limit(5000);

  type Row = NonNullable<typeof due>[number];
  type OrderProof = {
    number: string;
    title: string;
    status: string;
    delivered_at: string | null;
    payment_reported_at: string | null;
    supplier_confirmed_at: string | null;
    contractor: { name: string } | null;
    documents: { kind: string; check_status: string | null }[];
  };
  const orderOf = (c: Row) => c.order as unknown as OrderProof | null;
  const proven = (c: Row) => {
    const o = orderOf(c);
    if (!o || o.status === 'cancelled' || o.status === 'awaiting_supplier') return false;
    return (
      Boolean(o.delivered_at) ||
      Boolean(o.payment_reported_at) ||
      o.documents.some((d) => d.kind === 'invoice' && d.check_status === 'matched') ||
      (o.supplier_confirmed_at !== null && o.supplier_confirmed_at < proofCutoff)
    );
  };

  // One entry per commission to bill, from either table, grouped by the company that pays.
  type Due = { table: 'commissions' | 'project_commissions'; id: string; amount: number; line: BillLine };
  const byPayer = new Map<string, Due[]>();
  const add = (payerId: string, d: Due) => byPayer.set(payerId, [...(byPayer.get(payerId) ?? []), d]);
  for (const c of due ?? []) {
    if (!proven(c)) continue;
    const o = orderOf(c);
    add(c.supplier_id, {
      table: 'commissions',
      id: c.id,
      amount: Number(c.amount_ex_vat),
      line: { number: o?.number ?? '–', title: o?.title ?? '', contractor: o?.contractor?.name ?? '', baseExVat: Number(c.base_ex_vat), commissionExVat: Number(c.amount_ex_vat) },
    });
  }

  const { data: projects } = await admin
    .from('project_commissions')
    .select('id, payer_id, architect_id, base_ex_vat, amount_ex_vat, agreement:agreements(title), architect:companies!project_commissions_architect_id_fkey(name), contractor:companies!project_commissions_contractor_id_fkey(name)')
    .eq('status', 'pending')
    .is('bill_id', null)
    .lt('confirmed_at', monthStart.toISOString())
    .limit(5000);
  for (const p of projects ?? []) {
    const title = (p.agreement as unknown as { title: string } | null)?.title ?? '';
    const architect = (p.architect as unknown as { name: string } | null)?.name ?? '';
    const contractor = (p.contractor as unknown as { name: string } | null)?.name ?? '';
    add(p.payer_id, {
      table: 'project_commissions',
      id: p.id,
      amount: Number(p.amount_ex_vat),
      line: { number: 'Projet', title, contractor: p.payer_id === p.architect_id ? contractor : architect, baseExVat: Number(p.base_ex_vat), commissionExVat: Number(p.amount_ex_vat) },
    });
  }

  const idsOf = (rows: Due[], table: Due['table']) => rows.filter((d) => d.table === table).map((d) => d.id);

  let billed = 0;
  for (const [supplierId, rows] of byPayer) {
    const gross = rows.reduce((s, c) => s + c.amount, 0);
    // Referral credits come off the bill (each credit is used whole).
    const { data: credits } = await admin
      .from('referral_rewards')
      .select('id, amount_ex_vat')
      .eq('referrer_id', supplierId)
      .eq('kind', 'commission_credit')
      .is('used_at', null);
    const credit = Math.min(gross, (credits ?? []).reduce((s, r) => s + Number(r.amount_ex_vat ?? 0), 0));
    const creditIds = (credits ?? []).map((r) => r.id);
    const amounts = orderAmounts(Math.round((gross - credit) * 100) / 100);
    if (amounts.exVat < 1) {
      if (credit > 0 && gross >= 1) {
        // Fully covered by credits: nothing to pay this month.
        for (const table of ['commissions', 'project_commissions'] as const) {
          await admin.from(table).update({ status: 'paid', paid_at: now.toISOString(), invoiced_at: now.toISOString() }).in('id', idsOf(rows, table));
        }
        await admin.from('referral_rewards').update({ used_at: now.toISOString() }).in('id', creditIds);
      }
      continue;
    }
    const token = newToken();
    const { data: bill, error } = await admin
      .from('commission_bills')
      .insert({ supplier_id: supplierId, month, amount_ex_vat: amounts.exVat, vat: amounts.vat, amount_inc_vat: amounts.incVat, pay_token_hash: await hashToken(token) })
      .select('id, number')
      .single();
    if (error || !bill) continue; // Already billed for that month.
    const number = bill.number as string;
    await admin.from('commissions').update({ status: 'invoiced', invoiced_at: now.toISOString(), bill_id: bill.id, invoice_number: number }).in('id', idsOf(rows, 'commissions'));
    await admin.from('project_commissions').update({ status: 'invoiced', invoiced_at: now.toISOString(), bill_id: bill.id }).in('id', idsOf(rows, 'project_commissions'));
    if (creditIds.length) await admin.from('referral_rewards').update({ used_at: now.toISOString(), used_bill_id: bill.id }).in('id', creditIds);
    const { data: supplier } = await admin.from('companies').select('email, language').eq('id', supplierId).single();
    if (supplier?.email) {
      await sendMail(
        commissionBillMail(
          supplier.language as Lang,
          supplier.email,
          { number, month: month.slice(0, 7), exVat: amounts.exVat, incVat: amounts.incVat, lines: rows.map((d) => d.line), creditExVat: credit },
          `${functionsUrl()}/bill-commissions?pay=${token}`,
        ),
      ).catch(console.error);
    }
    await logEvent(admin, { kind: 'commission_billed', company_id: supplierId, data: { number, ex_vat: amounts.exVat, orders: rows.length } });
    billed++;
  }
  return json({ billed });
});
