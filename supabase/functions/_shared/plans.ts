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
  /** Price requests that can be sent per calendar month. */
  priceRequestsPerMonth: number;
  /** Suppliers that one price request can be sent to. */
  suppliersPerRequest: number;
  /** 'read' only lets the company browse collaboration posts. */
  network: 'read' | 'full';
  verifiedBadge: boolean;
  pdfExport: boolean;
  users: number;
};

export const PLANS: Record<Plan, PlanLimits> = {
  free: {
    priceExVat: 0,
    priceYearExVat: 0,
    searchesPerMonth: 10,
    priceRequestsPerMonth: 1,
    suppliersPerRequest: 3,
    network: 'read',
    verifiedBadge: false,
    pdfExport: false,
    users: 1,
  },
  pro: {
    priceExVat: 39,
    priceYearExVat: 390,
    searchesPerMonth: Infinity,
    priceRequestsPerMonth: 1,
    suppliersPerRequest: Infinity,
    network: 'full',
    verifiedBadge: true,
    pdfExport: false,
    users: 2,
  },
  full: {
    priceExVat: 89,
    priceYearExVat: 890,
    searchesPerMonth: Infinity,
    priceRequestsPerMonth: Infinity,
    suppliersPerRequest: Infinity,
    network: 'full',
    verifiedBadge: true,
    pdfExport: true,
    users: 5,
  },
};

export type SendCheck =
  | { ok: true }
  | { ok: false; reason: 'monthly_limit' | 'too_many_suppliers' | 'no_supplier'; limit?: number };

/** Whether a company on `plan` may send a request to `supplierCount` suppliers,
 * having already sent `sentThisMonth` requests this calendar month. */
export function canSendPriceRequest(plan: Plan, sentThisMonth: number, supplierCount: number): SendCheck {
  const limits = PLANS[plan];
  if (supplierCount < 1) return { ok: false, reason: 'no_supplier' };
  if (sentThisMonth >= limits.priceRequestsPerMonth) {
    return { ok: false, reason: 'monthly_limit', limit: limits.priceRequestsPerMonth };
  }
  if (supplierCount > limits.suppliersPerRequest) {
    return { ok: false, reason: 'too_many_suppliers', limit: limits.suppliersPerRequest };
  }
  return { ok: true };
}

/** First instant of the calendar month containing `now`, in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
