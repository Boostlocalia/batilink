// Plans, paid on Stripe's pages (card, Bancontact via card wallet, SEPA direct debit).
// POST { plan: 'pro' | 'full', interval?: 'month' | 'year' }  returns a Stripe Checkout page to subscribe.
// POST { action: 'portal' }      returns the Stripe page to change plan, update the
//                                 payment method, download invoices or cancel.
// The plan itself changes only when Stripe confirms it (stripe-webhook).

import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const stripe = stripeClient();
  if (!stripe) return json({ error: 'payments_unavailable' }, 503);
  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const [{ data: company }, { data: sub }] = await Promise.all([
    admin.from('companies').select('id, kind, name, email, language, vat_number, stripe_customer_id').eq('id', companyId).single(),
    admin.from('subscriptions').select('plan, status, provider_subscription_id').eq('company_id', companyId).maybeSingle(),
  ]);
  if (!company || company.kind !== 'contractor') return json({ error: 'not_allowed' }, 403);
  const back = `${appUrl()}/abonnement`;

  let customer = company.stripe_customer_id as string | null;
  if (!customer) {
    const created = await stripe.customers.create(
      {
        name: company.name,
        email: company.email ?? undefined,
        preferred_locales: [company.language === 'nl' ? 'nl' : 'fr'],
        metadata: { company_id: company.id },
        ...(company.vat_number ? { tax_id_data: [{ type: 'eu_vat', value: company.vat_number }] } : {}),
      },
      { idempotencyKey: `customer-${company.id}` },
    );
    customer = created.id;
    await admin.from('companies').update({ stripe_customer_id: customer }).eq('id', company.id);
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string; action?: string; interval?: string };
  const subscribed = Boolean(sub?.provider_subscription_id) && sub?.status !== 'canceled';

  // Changing or cancelling an existing plan happens on Stripe's customer portal.
  if (body.action === 'portal' || subscribed) {
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: back, locale: company.language === 'nl' ? 'nl' : 'fr' });
    return json({ url: portal.url });
  }

  const yearly = body.interval === 'year';
  const prices: Record<string, string | undefined> = {
    pro: Deno.env.get(yearly ? 'STRIPE_PRICE_PRO_YEAR' : 'STRIPE_PRICE_PRO'),
    full: Deno.env.get(yearly ? 'STRIPE_PRICE_FULL_YEAR' : 'STRIPE_PRICE_FULL'),
  };
  const price = body.plan ? prices[body.plan] : undefined;
  if (!price) return json({ error: 'invalid_plan' }, 400);
  // Belgian VAT: either a fixed Stripe tax rate (21 %), kept on the subscription when the plan
  // changes, or Stripe Tax, which also handles reverse charge for EU VAT numbers abroad.
  const taxRate = Deno.env.get('STRIPE_TAX_RATE');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    locale: company.language === 'nl' ? 'nl' : 'fr',
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { company_id: company.id }, ...(taxRate ? { default_tax_rates: [taxRate] } : {}) },
    automatic_tax: { enabled: !taxRate && Deno.env.get('STRIPE_AUTOMATIC_TAX') === 'on' },
    customer_update: { address: 'auto', name: 'auto' },
    billing_address_collection: 'required',
    success_url: `${back}?paiement=ok`,
    cancel_url: back,
  });
  return json({ url: session.url });
});
