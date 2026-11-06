// Commission on an architect's project, shared by the app (to show it) and the
// server (to record it). Keep this file free of imports so both runtimes can load it.

export const PROJECT_COMMISSION_RATE = 0.05;

/** Who pays it once a subscribed contractor confirms the project with the architect. */
export const PROJECT_COMMISSION_PAYER: 'contractor' | 'architect' = 'contractor';

/** Plans on which the contractor counts as subscribed (the Premium trial included). */
export const SUBSCRIBED_PLANS = ['pro', 'full'] as const;

/** Commission excluding VAT on a project worth `amountExVat`, rounded to the cent. */
export function projectCommission(amountExVat: number): number {
  return Math.round(amountExVat * PROJECT_COMMISSION_RATE * 100) / 100;
}
