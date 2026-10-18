// Stripe calls this endpoint when something happens to a payment, a supplier's
// account or a plan. Every call is authenticated by its signature; nothing in
// the app can mark a payment as paid or change a plan without it.
//
// Two endpoints point here in the Stripe dashboard: one for BatiLink's own
// account (plans, commission bills) signed with STRIPE_WEBHOOK_SECRET, one for
// connected accounts (order payments, supplier onboarding) signed with
// STRIPE_CONNECT_WEBHOOK_SECRET.

import { orderNewsMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { issueSupplierLink } from '../_shared/order-docs.ts';
import { canDo, type OrderStatus } from '../_shared/orders.ts';
import { canTakePayments, Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

async function verify(stripe: Stripe, req: Request): Promise<Stripe.Event | null> {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return null;
  const payload = await req.text();
  for (const secret of [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')]) {
    if (!secret) continue;
    try {
      return await stripe.webhooks.constructEventAsync(payload, signature, secret);
    } catch {
      // Try the other endpoint's secret.
    }
  }
  return null;
}

const PLAN_BY_PRICE = () =>
  ({
    [Deno.env.get('STRIPE_PRICE_PRO') ?? '-']: 'pro',
    [Deno.env.get('STRIPE_PRICE_FULL') ?? '-']: 'full',
  }) as Record<string, 'pro' | 'full'>;

/** An order payment (deposit or balance) or a commission bill was paid. */
async function paymentSucceeded(admin: Admin, session: Stripe.Checkout.Session) {
  const { data: payment } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null })
    .eq('stripe_checkout_session_id', session.id)
    .neq('status', 'paid')
    .select('id, purpose, order_id, commission_bill_id, amount_cents, application_fee_cents, company_id')
    .maybeSingle();
  // Unknown session, or already handled (Stripe may deliver an event twice).
  if (!payment) return;

  if (payment.purpose === 'commission' && payment.commission_bill_id) {
    const now = new Date().toISOString();
    await admin.from('commission_bills').update({ status: 'paid', paid_at: now }).eq('id', payment.commission_bill_id);
    const { data: rows } = await admin.from('commissions').select('id, amount_ex_vat').eq('bill_id', payment.commission_bill_id);
    for (const c of rows ?? []) {
      await admin
        .from('commissions')
        .update({ status: 'paid', paid_at: now, collected_inc_vat: Math.round(Number(c.amount_ex_vat) * 121) / 100 })
        .eq('id', c.id);
    }
    await logEvent(admin, { kind: 'payment_succeeded', company_id: payment.company_id, data: { purpose: 'commission', cents: payment.amount_cents } });
    return;
  }
  if (!payment.order_id) return;

  const { data: order } = await admin.from('purchase_orders').select('*').eq('id', payment.order_id).single();
  if (!order) return;
  const euros = Number(payment.amount_cents) / 100;
  const patch: Record<string, unknown> = {
    amount_paid_online: Math.round((Number(order.amount_paid_online) + euros) * 100) / 100,
    updated_at: new Date().toISOString(),
  };
  // An online deposit is its own proof: the order starts at once.
  if (payment.purpose === 'order_deposit' && canDo('deposit_paid_online', order.status as OrderStatus)) {
    Object.assign(patch, { status: 'in_progress', deposit_received_at: new Date().toISOString(), deposit_method: 'online', deposit_rejected_reason: null });
  }
  await admin.from('purchase_orders').update(patch).eq('id', order.id);

  if (Number(payment.application_fee_cents) > 0) {
    const { data: commission } = await admin.from('commissions').select('id, amount_ex_vat, collected_inc_vat').eq('order_id', order.id).maybeSingle();
    if (commission) {
      const collected = Math.round((Number(commission.collected_inc_vat) + Number(payment.application_fee_cents) / 100) * 100) / 100;
      const due = Math.round(Number(commission.amount_ex_vat) * 121) / 100;
      await admin
        .from('commissions')
        .update({ collected_inc_vat: collected, ...(collected >= due ? { status: 'paid', paid_at: new Date().toISOString() } : {}) })
        .eq('id', commission.id);
    }
  }
  await logEvent(admin, {
    kind: 'payment_succeeded',
    company_id: payment.company_id,
    quote_id: order.quote_id,
    data: { order: order.number, purpose: payment.purpose, cents: payment.amount_cents, fee: payment.application_fee_cents },
  });

  const [{ data: supplier }, { data: contractor }] = await Promise.all([
    admin.from('companies').select('email, language').eq('id', order.supplier_id).single(),
    admin.from('companies').select('name').eq('id', order.contractor_id).single(),
  ]);
  if (supplier?.email) {
    const url = await issueSupplierLink(admin, order.id);
    await sendMail(
      orderNewsMail({ lang: supplier.language as Lang, to: supplier.email, number: order.number, title: order.title, other: contractor?.name ?? '', url }, 'paid_online', euros),
    ).catch(console.error);
  }
}

async function paymentFailed(admin: Admin, session: Stripe.Checkout.Session, status: 'failed' | 'expired') {
  const { data } = await admin
    .from('payments')
    .update({ status })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'open')
    .select('company_id, order_id')
    .maybeSingle();
  if (data && status === 'failed') await logEvent(admin, { kind: 'payment_failed', company_id: data.company_id, data: { order_id: data.order_id } });
}

async function subscriptionChanged(admin: Admin, sub: Stripe.Subscription) {
  const companyId = sub.metadata?.company_id;
  if (!companyId) return;
  const price = sub.items.data[0]?.price.id ?? '';
  const plan = PLAN_BY_PRICE()[price];
  const active = ['active', 'trialing'].includes(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end;
  await admin
    .from('subscriptions')
    .update({
      plan: active && plan ? plan : 'free',
      status: sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : active ? 'active' : 'canceled',
      provider_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      provider_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId);
  await logEvent(admin, { kind: 'subscription_changed', company_id: companyId, data: { plan: plan ?? null, status: sub.status } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const stripe = stripeClient();
  if (!stripe) return json({ error: 'payments_unavailable' }, 503);
  const event = await verify(stripe, req);
  if (!event) return json({ error: 'invalid_signature' }, 400);
  const admin = adminClient();

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // Bank debits confirm later: wait for async_payment_succeeded.
      if (session.mode === 'payment' && session.payment_status === 'paid') await paymentSucceeded(admin, session);
      break;
    }
    case 'checkout.session.async_payment_failed':
      await paymentFailed(admin, event.data.object, 'failed');
      break;
    case 'checkout.session.expired':
      await paymentFailed(admin, event.data.object, 'expired');
      break;
    case 'account.updated': {
      const account = event.data.object;
      const enabled = canTakePayments(account);
      const { data } = await admin
        .from('companies')
        .update({ online_payments: enabled })
        .eq('stripe_account_id', account.id)
        .neq('online_payments', enabled)
        .select('id');
      if (data?.length && enabled) await logEvent(admin, { kind: 'supplier_payments_enabled', company_id: data[0].id });
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await subscriptionChanged(admin, event.data.object);
      break;
  }
  return json({ received: true });
});
