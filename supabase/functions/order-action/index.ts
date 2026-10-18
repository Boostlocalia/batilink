// The contractor's steps on a purchase order (signed in).
// multipart/form-data { order_id, kind: deposit_proof | delivery_note | invoice, file }
//   attaches a document. A deposit proof is forwarded to the supplier; an invoice
//   is read (Peppol UBL) and checked against the order.
// JSON { order_id, action }:
//   delivered                   confirms receipt of the goods
//   cancel                      withdraws the order before the supplier confirmed it
//   pay { kind: deposit | balance }  returns a secure Stripe payment page

import { commissionFor } from '../_shared/commission.ts';
import { depositProofMail, orderNewsMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { contractorOrderUrl, issueSupplierLink, storeDocument } from '../_shared/order-docs.ts';
import { applicationFeeCents, balanceDueIncVat, canDo, commissionIncVat, toCents, type OrderStatus } from '../_shared/orders.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, corsHeaders, json } from '../_shared/supabase.ts';
import { checkInvoice, parseUbl } from '../_shared/ubl.ts';

type Admin = ReturnType<typeof adminClient>;

async function caller(req: Request, admin: Admin) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  if (!data.user) return null;
  const { data: profile } = await admin.from('profiles').select('company_id').eq('id', data.user.id).single();
  return profile?.company_id ? { userId: data.user.id, companyId: profile.company_id as string, email: data.user.email ?? null } : null;
}

async function loadOrder(admin: Admin, orderId: unknown, companyId: string) {
  if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const { data } = await admin.from('purchase_orders').select('*').eq('id', orderId).maybeSingle();
  // Only the contractor who placed the order acts on it here.
  return data && data.contractor_id === companyId ? data : null;
}

type Order = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

async function move(admin: Admin, order: Order, patch: Record<string, unknown>) {
  const { data } = await admin
    .from('purchase_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', order.status)
    .select('id');
  return Boolean(data?.length);
}

async function parties(admin: Admin, order: Order) {
  const [{ data: supplier }, { data: contractor }] = await Promise.all([
    admin.from('companies').select('name, email, language, vat_number, online_payments, stripe_account_id').eq('id', order.supplier_id).single(),
    admin.from('companies').select('name, language, vat_number').eq('id', order.contractor_id).single(),
  ]);
  return { supplier, contractor };
}

async function mailSupplier(admin: Admin, order: Order, build: (d: { lang: Lang; to: string; number: string; title: string; other: string; url: string }) => Parameters<typeof sendMail>[0]) {
  const { supplier, contractor } = await parties(admin, order);
  if (!supplier?.email) return;
  const url = await issueSupplierLink(admin, order.id);
  await sendMail(build({ lang: supplier.language as Lang, to: supplier.email, number: order.number, title: order.title, other: contractor?.name ?? '', url })).catch(console.error);
}

async function upload(req: Request, admin: Admin, who: NonNullable<Awaited<ReturnType<typeof caller>>>) {
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: 'invalid_body' }, 400);
  const order = await loadOrder(admin, form.get('order_id'), who.companyId);
  if (!order) return json({ error: 'not_found' }, 404);
  const kind = form.get('kind');
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'no_file' }, 400);
  const status = order.status as OrderStatus;

  if (kind === 'deposit_proof') {
    if (!canDo('deposit_proof', status)) return json({ error: 'wrong_step' }, 409);
    const stored = await storeDocument(admin, { orderId: order.id, kind, file, userId: who.userId });
    if ('error' in stored) return json({ error: stored.error }, stored.error === 'storage' ? 500 : 400);
    const ok =
      status === 'deposit_proof_sent' ||
      (await move(admin, order, { status: 'deposit_proof_sent', deposit_proof_sent_at: new Date().toISOString(), deposit_rejected_reason: null }));
    if (!ok) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, { kind: 'deposit_proof_sent', company_id: who.companyId, quote_id: order.quote_id, data: { order: order.number, sha256: stored.doc.sha256 } });
    await mailSupplier(admin, order, (d) => depositProofMail(d, Number(order.deposit_inc_vat)));
    return json({ ok: true, status: 'deposit_proof_sent' });
  }

  if (kind === 'delivery_note') {
    if (!['in_progress', 'delivered'].includes(status)) return json({ error: 'wrong_step' }, 409);
    const stored = await storeDocument(admin, { orderId: order.id, kind, file, userId: who.userId });
    if ('error' in stored) return json({ error: stored.error }, stored.error === 'storage' ? 500 : 400);
    await logEvent(admin, { kind: 'document_uploaded', company_id: who.companyId, quote_id: order.quote_id, data: { order: order.number, kind, sha256: stored.doc.sha256 } });
    return json({ ok: true });
  }

  if (kind === 'invoice') {
    if (!['in_progress', 'delivered'].includes(status)) return json({ error: 'wrong_step' }, 409);
    const { supplier, contractor } = await parties(admin, order);
    const head = new TextDecoder().decode(new Uint8Array(await file.slice(0, 5 * 1024 * 1024).arrayBuffer()));
    const invoice = file.size <= 5 * 1024 * 1024 ? parseUbl(head) : null;
    const check = invoice
      ? checkInvoice(invoice, {
          number: order.number,
          supplierVat: supplier?.vat_number ?? null,
          contractorVat: contractor?.vat_number ?? null,
          totalExVat: Number(order.total_ex_vat),
        })
      : // A PDF or a photo is kept as evidence and checked by hand.
        { status: 'manual_review' as const, findings: ['not_structured'] };
    const stored = await storeDocument(admin, {
      orderId: order.id,
      kind,
      file,
      userId: who.userId,
      extra: {
        invoice_number: invoice?.number ?? null,
        issue_date: invoice?.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(invoice.issueDate) ? invoice.issueDate : null,
        supplier_vat: invoice?.supplierVat ?? null,
        buyer_vat: invoice?.buyerVat ?? null,
        invoice_total_ex_vat: invoice?.totalExVat ?? null,
        order_reference: invoice?.orderReference?.slice(0, 200) ?? null,
        check_status: check.status,
        findings: check.findings,
      },
    });
    if ('error' in stored) return json({ error: stored.error }, stored.error === 'storage' ? 500 : 400);
    // The commission follows what was actually invoiced, as long as it is not billed yet.
    if (check.status === 'matched' && invoice?.totalExVat !== null && invoice?.totalExVat !== undefined) {
      const { data: commission } = await admin.from('commissions').select('id, rate, status').eq('order_id', order.id).maybeSingle();
      if (commission?.status === 'pending') {
        await admin
          .from('commissions')
          .update({ base_ex_vat: invoice.totalExVat, amount_ex_vat: commissionFor(invoice.totalExVat, Number(commission.rate)), base_source: 'invoice' })
          .eq('id', commission.id)
          .eq('status', 'pending');
      }
    }
    await logEvent(admin, {
      kind: 'invoice_checked',
      company_id: who.companyId,
      quote_id: order.quote_id,
      data: { order: order.number, status: check.status, findings: check.findings, invoice: invoice?.number ?? null, sha256: stored.doc.sha256 },
    });
    return json({ ok: true, check });
  }

  return json({ error: 'invalid_kind' }, 400);
}

async function pay(admin: Admin, order: Order, who: NonNullable<Awaited<ReturnType<typeof caller>>>, kind: unknown) {
  const stripe = stripeClient();
  if (!stripe) return json({ error: 'payments_unavailable' }, 503);
  const status = order.status as OrderStatus;
  const { supplier, contractor } = await parties(admin, order);
  if (!supplier?.online_payments || !supplier.stripe_account_id) return json({ error: 'supplier_not_connected' }, 409);

  let amount: number;
  let purpose: 'order_deposit' | 'order_balance';
  if (kind === 'deposit') {
    if (!canDo('deposit_paid_online', status) || Number(order.deposit_inc_vat) <= 0) return json({ error: 'wrong_step' }, 409);
    amount = Number(order.deposit_inc_vat);
    purpose = 'order_deposit';
  } else if (kind === 'balance') {
    if (!['in_progress', 'delivered'].includes(status)) return json({ error: 'wrong_step' }, 409);
    const offlineDeposit = order.deposit_method === 'transfer' ? Number(order.deposit_inc_vat) : 0;
    amount = balanceDueIncVat(Number(order.total_inc_vat), Number(order.amount_paid_online), offlineDeposit);
    purpose = 'order_balance';
  } else {
    return json({ error: 'invalid_kind' }, 400);
  }
  const cents = toCents(amount);
  if (cents < 50) return json({ error: 'nothing_to_pay' }, 409);

  // Commission still to collect: what is due, minus what was collected or is
  // already part of a payment page that may still be paid.
  const [{ data: commission }, { data: open }] = await Promise.all([
    admin.from('commissions').select('amount_ex_vat, collected_inc_vat, status').eq('order_id', order.id).maybeSingle(),
    admin.from('payments').select('application_fee_cents').eq('order_id', order.id).eq('status', 'open'),
  ]);
  const pendingFees = (open ?? []).reduce((s, p) => s + Number(p.application_fee_cents), 0) / 100;
  const fee =
    commission && commission.status !== 'cancelled' && commission.status !== 'paid'
      ? applicationFeeCents(cents, commissionIncVat(Number(commission.amount_ex_vat)), Number(commission.collected_inc_vat) + pendingFees)
      : 0;

  const lang = (contractor?.language ?? 'fr') as Lang;
  const label =
    lang === 'nl'
      ? `${purpose === 'order_deposit' ? 'Voorschot' : 'Saldo'} bestelling ${order.number}`
      : `${purpose === 'order_deposit' ? 'Acompte' : 'Solde'} commande ${order.number}`;
  const back = contractorOrderUrl(order.id);
  const metadata = { order_id: order.id, purpose, company_id: who.companyId };
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      locale: lang,
      customer_email: who.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: cents, product_data: { name: label } } }],
      payment_intent_data: {
        description: `${label} · ${order.title}`.slice(0, 500),
        metadata,
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      metadata,
      success_url: `${back}?paiement=ok`,
      cancel_url: `${back}?paiement=annule`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    // The payment goes straight to the supplier's account; BatiLink keeps the fee.
    { stripeAccount: supplier.stripe_account_id },
  );
  await admin.from('payments').insert({
    purpose,
    company_id: who.companyId,
    order_id: order.id,
    amount_cents: cents,
    application_fee_cents: fee,
    stripe_account: supplier.stripe_account_id,
    stripe_checkout_session_id: session.id,
  });
  await logEvent(admin, { kind: 'payment_started', company_id: who.companyId, quote_id: order.quote_id, data: { order: order.number, purpose, cents, fee } });
  return json({ url: session.url });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const who = await caller(req, admin);
  if (!who) return json({ error: 'unauthorized' }, 401);

  if ((req.headers.get('Content-Type') ?? '').startsWith('multipart/form-data')) return upload(req, admin, who);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const order = await loadOrder(admin, body.order_id, who.companyId);
  if (!order) return json({ error: 'not_found' }, 404);
  const status = order.status as OrderStatus;

  if (body.action === 'delivered') {
    if (!canDo('delivered', status)) return json({ error: 'wrong_step' }, 409);
    if (!(await move(admin, order, { status: 'delivered', delivered_at: new Date().toISOString() }))) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, { kind: 'order_delivered', company_id: who.companyId, quote_id: order.quote_id, data: { order: order.number } });
    await mailSupplier(admin, order, (d) => orderNewsMail(d, 'delivered'));
    return json({ ok: true, status: 'delivered' });
  }

  if (body.action === 'cancel') {
    if (!canDo('contractor_cancel', status)) return json({ error: 'wrong_step' }, 409);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : 'contractor_cancelled';
    if (!(await move(admin, order, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason || 'contractor_cancelled' }))) {
      return json({ error: 'wrong_step' }, 409);
    }
    await admin.from('commissions').update({ status: 'cancelled' }).eq('order_id', order.id).eq('status', 'pending');
    await logEvent(admin, { kind: 'order_cancelled', company_id: who.companyId, quote_id: order.quote_id, data: { order: order.number, reason } });
    return json({ ok: true, status: 'cancelled' });
  }

  if (body.action === 'pay') return pay(admin, order, who, body.kind);

  return json({ error: 'unknown_action' }, 400);
});
