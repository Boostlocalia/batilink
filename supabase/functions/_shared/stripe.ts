// Stripe: online payments for orders (paid to the supplier's own Stripe account,
// commission kept at source), BatiLink's plans and commission bills.
// Card and bank details are entered on Stripe's pages only and never reach BatiLink.

import Stripe from 'npm:stripe@23.0.0';

export { Stripe };

/** Null when STRIPE_SECRET_KEY is not set: online payment is then unavailable. */
export function stripeClient(): Stripe | null {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  return key ? new Stripe(key, { maxNetworkRetries: 2 }) : null;
}

/**
 * Suppliers get their own Stripe account, created by BatiLink: Stripe verifies
 * their identity (KYC), they are paid directly, pay their own Stripe fees and
 * carry their own refunds and disputes.
 */
export async function ensureSupplierAccount(
  stripe: Stripe,
  supplier: { id: string; name: string; email: string | null; vat_number: string | null; stripe_account_id: string | null },
): Promise<string> {
  if (supplier.stripe_account_id) return supplier.stripe_account_id;
  const account = await stripe.accounts.create(
    {
      country: 'BE',
      email: supplier.email ?? undefined,
      business_type: 'company',
      company: { name: supplier.name, ...(supplier.vat_number ? { vat_id: supplier.vat_number } : {}) },
      controller: {
        fees: { payer: 'account' },
        losses: { payments: 'stripe' },
        stripe_dashboard: { type: 'full' },
      },
      metadata: { company_id: supplier.id },
    },
    // A retry never creates a second account for the same supplier.
    { idempotencyKey: `account-${supplier.id}` },
  );
  return account.id;
}

/** A Stripe-hosted page where the supplier enters their company and bank details. */
export async function onboardingLink(stripe: Stripe, account: string, returnUrl: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: returnUrl,
  });
  return link.url;
}

export const canTakePayments = (account: Stripe.Account) => Boolean(account.charges_enabled);
