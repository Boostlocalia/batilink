// Stripe calls this endpoint when a commission bill is paid or a plan changes.
// Every call is authenticated by its signature (STRIPE_WEBHOOK_SECRET): nothing
// in the app can mark a payment as paid or change a plan without it.

import { logEvent } from '../_shared/events.ts';
import { Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

async function verify(stripe: Stripe, req: Request): Promise<Stripe.Event | null> {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return null;
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return null;
  try {
    return await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return null;
  }
}

type PriceInfo = { plan: 'pro' | 'full'; interval: 'month' | 'year' };
const PLAN_BY_PRICE = () =>
  ({
    [Deno.env.get('STRIPE_PRICE_PRO') ?? '-']: { plan: 'pro', interval: 'month' },
    [Deno.env.get('STRIPE_PRICE_FULL') ?? '-']: { plan: 'full', interval: 'month' },
    [Deno.env.get('STRIPE_PRICE_PRO_YEAR') ?? '-y']: { plan: 'pro', interval: 'year' },
    [Deno.env.get('STRIPE_PRICE_FULL_YEAR') ?? '-y']: { plan: 'full', interval: 'year' },
  }) as Record<string, PriceInfo>;

/** A commission bill was paid. */
async function paymentSucceeded(admin: Admin, session: Stripe.Checkout.Session) {
  const { data: payment } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null })
    .eq('stripe_checkout_session_id', session.id)
    .neq('status', 'paid')
    .select('id, purpose, commission_bill_id, amount_cents, company_id')
    .maybeSingle();
  // Unknown session, or already handled (Stripe may deliver an event twice).
  if (!payment || payment.purpose !== 'commission' || !payment.commission_bill_id) return;
  const now = new Date().toISOString();
  await admin.from('commission_bills').update({ status: 'paid', paid_at: now }).eq('id', payment.commission_bill_id);
  await admin.from('commissions').update({ status: 'paid', paid_at: now }).eq('bill_id', payment.commission_bill_id);
  await admin.from('project_commissions').update({ status: 'paid', paid_at: now }).eq('bill_id', payment.commission_bill_id);
  await logEvent(admin, { kind: 'payment_succeeded', company_id: payment.company_id, data: { purpose: 'commission', cents: payment.amount_cents } });
}

async function paymentFailed(admin: Admin, session: Stripe.Checkout.Session, status: 'failed' | 'expired') {
  const { data } = await admin
    .from('payments')
    .update({ status })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'open')
    .select('company_id, commission_bill_id')
    .maybeSingle();
  if (data && status === 'failed') await logEvent(admin, { kind: 'payment_failed', company_id: data.company_id, data: { bill: data.commission_bill_id } });
}

/** Founding members: the first live paid plan takes a place; cancelling or changing plan ends the price guarantee. */
async function updateFounder(admin: Admin, companyId: string, plan: 'pro' | 'full' | undefined, status: string) {
  const { data: row } = await admin
    .from('subscriptions')
    .select('founder_number, founder_plan, founder_ended_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!row) return;
  if (row.founder_number === null) {
    if (status !== 'active' || !plan) return;
    const { data: number } = await admin.rpc('claim_founder', { p_company: companyId, p_plan: plan });
    if (number) await logEvent(admin, { kind: 'founder_joined', company_id: companyId, data: { number, plan } });
    return;
  }
  const ends = status === 'canceled' || (!!plan && plan !== row.founder_plan);
  if (row.founder_ended_at || !ends) return;
  await admin.from('subscriptions').update({ founder_ended_at: new Date().toISOString() }).eq('company_id', companyId);
  await logEvent(admin, { kind: 'founder_ended', company_id: companyId, data: { number: row.founder_number, status, plan: plan ?? null } });
}

async function subscriptionChanged(admin: Admin, sub: Stripe.Subscription, livemode: boolean) {
  const companyId = sub.metadata?.company_id;
  if (!companyId) return;
  const price = sub.items.data[0]?.price.id ?? '';
  const info = PLAN_BY_PRICE()[price];
  const plan = info?.plan;
  const active = ['active', 'trialing'].includes(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const status = sub.status === 'past_due' || sub.status === 'unpaid' ? 'past_due' : active ? 'active' : 'canceled';
  await admin
    .from('subscriptions')
    .update({
      plan: active && plan ? plan : 'free',
      // A paid plan replaces the free trial.
      ...(active && plan ? { trial_ends_at: null, billing_interval: info.interval } : {}),
      status,
      provider_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      provider_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId);
  await logEvent(admin, { kind: 'subscription_changed', company_id: companyId, data: { plan: plan ?? null, status: sub.status } });
  // Test payments never take a founding place.
  if (livemode) await updateFounder(admin, companyId, plan, status);
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
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await subscriptionChanged(admin, event.data.object, event.livemode);
      break;
  }
  return json({ received: true });
});
