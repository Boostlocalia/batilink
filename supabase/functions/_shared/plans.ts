// Subscription rules, shared by the app (for the UI) and the edge functions
// (which enforce them). Keep this file free of imports so both runtimes can load it.

export type Plan = 'free' | 'pro' | 'full';

export type PlanLimits = {
  /** Monthly price in euros, excluding VAT. */
  priceExVat: number;
  /** Yearly price in euros, excluding VAT: two months free. */
  priceYearExVat: number;
  /** Company searches per month in the contractor network. */
  searchesPerMonth: number;
  /** Posts and answers in the contractor network per calendar month. */
  networkExchangesPerMonth: number;
  /** Supplier side: 'preview' shows the matching suppliers without sending, 'none' hides it. */
  suppliers: 'preview' | 'none' | 'full';
  /** Price requests that can be sent per calendar month. */
  priceRequestsPerMonth: number;
  /** Suppliers that one price request can be sent to. */
  suppliersPerRequest: number;
  verifiedBadge: boolean;
  pdfExport: boolean;
  users: number;
};

// Ids stay free / pro / full in the database; the names shown are Test, Starter, Premium.
// 'free' is what a contractor falls back to when the trial ends: no access until a plan is chosen.
export const PLANS: Record<Plan, PlanLimits> = {
  free: {
    priceExVat: 0,
    priceYearExVat: 0,
    searchesPerMonth: 0,
    networkExchangesPerMonth: 0,
    suppliers: 'none',
    priceRequestsPerMonth: 0,
    suppliersPerRequest: 0,
    verifiedBadge: false,
    pdfExport: false,
    users: 1,
  },
  pro: {
    priceExVat: 69.99,
    priceYearExVat: 699.9,
    searchesPerMonth: Infinity,
    networkExchangesPerMonth: Infinity,
    suppliers: 'none',
    priceRequestsPerMonth: 0,
    suppliersPerRequest: 0,
    verifiedBadge: true,
    pdfExport: false,
    users: 2,
  },
  full: {
    priceExVat: 129.99,
    priceYearExVat: 1299.9,
    searchesPerMonth: Infinity,
    networkExchangesPerMonth: Infinity,
    suppliers: 'full',
    priceRequestsPerMonth: Infinity,
    suppliersPerRequest: Infinity,
    verifiedBadge: true,
    pdfExport: true,
    users: 5,
  },
};

/** The plan a new contractor tries for free, and the one a referral reward gives. */
export const TRIAL_PLAN: Plan = 'full';

/** Length of the free trial for a new contractor. */
export const TRIAL_DAYS = 7;

/** The plan in force now: a trial that has ended counts as 'free' before the nightly job records it. */
export function effectivePlan(
  sub: { plan: string; status: string; trial_ends_at?: string | null; provider_subscription_id?: string | null } | null | undefined,
  now: Date = new Date(),
): Plan {
  if (!sub || sub.status !== 'active') return 'free';
  if (sub.plan === TRIAL_PLAN && !sub.provider_subscription_id && sub.trial_ends_at && new Date(sub.trial_ends_at) <= now) return 'free';
  return sub.plan as Plan;
}

export type SendCheck =
  | { ok: true }
  | { ok: false; reason: 'plan' | 'monthly_limit' | 'too_many_suppliers' | 'no_supplier'; limit?: number };

/** Whether a company on `plan` may send a request to `supplierCount` suppliers,
 * having already sent `sentThisMonth` requests this calendar month. */
export function canSendPriceRequest(plan: Plan, sentThisMonth: number, supplierCount: number): SendCheck {
  const limits = PLANS[plan];
  if (limits.suppliers !== 'full') return { ok: false, reason: 'plan' };
  if (supplierCount < 1) return { ok: false, reason: 'no_supplier' };
  if (sentThisMonth >= limits.priceRequestsPerMonth) {
    return { ok: false, reason: 'monthly_limit', limit: limits.priceRequestsPerMonth };
  }
  if (supplierCount > limits.suppliersPerRequest) {
    return { ok: false, reason: 'too_many_suppliers', limit: limits.suppliersPerRequest };
  }
  return { ok: true };
}

/** How many suppliers BatiNode finds when the contractor lets it choose. */
export const AUTO_SUPPLIERS = 5;

/** First instant of the calendar month containing `now`, in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
