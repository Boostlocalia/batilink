// Stripe: BatiLink's plans and the monthly commission bills. Card and bank
// details are entered on Stripe's pages only and never reach BatiLink.
// Orders are paid by the contractor directly to the supplier.

import Stripe from 'npm:stripe@23.0.0';

export { Stripe };

/** Null when STRIPE_SECRET_KEY is not set: online payment is then unavailable. */
export function stripeClient(): Stripe | null {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  return key ? new Stripe(key, { maxNetworkRetries: 2 }) : null;
}
