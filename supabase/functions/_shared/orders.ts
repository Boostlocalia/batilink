// Purchase order rules shared by the app (display) and the functions (enforcement).
// Kept free of imports so both runtimes can load it.

export const BELGIAN_VAT = 0.21;

export type OrderStatus =
  | 'awaiting_supplier'
  | 'awaiting_deposit'
  | 'deposit_proof_sent'
  | 'in_progress'
  | 'delivered'
  | 'cancelled';

const round2 = (n: number) => Math.round(n * 100) / 100;
export const toCents = (euros: number) => Math.round(euros * 100);

/** Excluding VAT, VAT at 21 %, and including VAT (orders and commission bills). */
export function orderAmounts(totalExVat: number) {
  const vat = round2(totalExVat * BELGIAN_VAT);
  return { exVat: round2(totalExVat), vat, incVat: round2(totalExVat + vat) };
}

/** IBAN check (ISO 13616, mod 97). Returns the compact form or null. */
export function normalizeIban(input: string): string | null {
  const iban = input.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  if (iban.startsWith('BE') && iban.length !== 16) return null;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? iban : null;
}

/** "BE68 5390 0754 7034" */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

export type OrderAction =
  | 'supplier_confirm'
  | 'supplier_decline'
  | 'deposit_proof'
  | 'deposit_received'
  | 'deposit_rejected'
  | 'delivered'
  | 'payment_proof'
  | 'contractor_cancel';

const ALLOWED: Record<OrderAction, OrderStatus[]> = {
  supplier_confirm: ['awaiting_supplier'],
  supplier_decline: ['awaiting_supplier', 'awaiting_deposit', 'deposit_proof_sent'],
  deposit_proof: ['awaiting_deposit', 'deposit_proof_sent'],
  deposit_received: ['deposit_proof_sent', 'awaiting_deposit'],
  deposit_rejected: ['deposit_proof_sent'],
  delivered: ['in_progress'],
  payment_proof: ['in_progress', 'delivered'],
  contractor_cancel: ['awaiting_supplier'],
};

/** Whether `action` may happen while the order is in `status`. */
export function canDo(action: OrderAction, status: OrderStatus): boolean {
  return ALLOWED[action].includes(status);
}

/** Status after the supplier confirms: a deposit holds the order until it is received. */
export function statusAfterConfirm(depositIncVat: number): OrderStatus {
  return depositIncVat > 0 ? 'awaiting_deposit' : 'in_progress';
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/xml': 'xml',
  'text/xml': 'xml',
};
