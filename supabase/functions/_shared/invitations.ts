// Invites suppliers to quote on a sent price request: one quote row and one e-mail
// with a personal reply link each. Used when the contractor sends the request and
// when the BatiNode team adds suppliers to a request it looks after.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { SUPPLIER_COMMISSION_ACTIVE } from './commission.ts';
import { contractorAddress, invitationMail, sendMail, type Lang } from './email.ts';
import { relayAddress } from './relay-address.ts';
import { appUrl } from './supabase.ts';
import { hashToken, newToken, tokenExpiry } from './tokens.ts';

export { AUTO_SUPPLIERS } from './plans.ts';

export type SentRequest = {
  id: string;
  company_id: string;
  title: string;
  category_id: number;
  postal_code: string;
  city: string | null;
  needed_by: string | null;
  reply_by: string;
  fulfilment: string;
};

export async function inviteSuppliers(admin: SupabaseClient, request: SentRequest, supplierIds: string[]): Promise<{ sent: string[]; failed: string[] }> {
  if (!supplierIds.length) return { sent: [], failed: [] };
  const [{ data: items }, { data: contractor }, { data: suppliers }] = await Promise.all([
    admin.from('request_items').select('label, quantity, unit').eq('request_id', request.id).order('position'),
    admin.from('companies').select('name, verified_at, vat_number, street, postal_code, city').eq('id', request.company_id).single(),
    // Suppliers who unsubscribed from request e-mails are skipped.
    admin.from('companies').select('id, email, quote_email, language, commission_rate').in('id', supplierIds).eq('kind', 'supplier').is('requests_stopped_at', null),
  ]);

  const sent: string[] = [];
  const failed: string[] = [];
  for (const supplier of suppliers ?? []) {
    const to = supplier.quote_email ?? supplier.email;
    if (!to) {
      failed.push(supplier.id);
      continue;
    }
    const token = newToken();
    const { data: quote, error } = await admin
      .from('quotes')
      .insert({ request_id: request.id, supplier_id: supplier.id, token_hash: await hashToken(token), token_expires_at: tokenExpiry() })
      .select('reply_key')
      .single();
    if (error || !quote) {
      failed.push(supplier.id);
      continue;
    }
    try {
      await sendMail(
        invitationMail({
          lang: supplier.language as Lang,
          to,
          contractor: contractor?.name ?? '',
          contractorVerified: Boolean(contractor?.verified_at),
          contractorVat: contractor?.vat_number ?? null,
          contractorAddress: contractorAddress(contractor),
          title: request.title,
          postalCode: request.postal_code,
          city: request.city,
          items: items ?? [],
          neededBy: request.needed_by,
          replyBy: request.reply_by,
          delivery: request.fulfilment === 'delivery',
          url: `${appUrl()}/offre/${token}`,
          unsubscribeUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/supplier-quote?token=${token}&unsubscribe=1`,
          commissionRate: SUPPLIER_COMMISSION_ACTIVE ? Number(supplier.commission_rate) : null,
          replyTo: relayAddress('supplier', quote.reply_key, Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined),
        }),
      );
      sent.push(supplier.id);
    } catch (e) {
      console.error(e);
      failed.push(supplier.id);
    }
  }
  return { sent, failed };
}

/**
 * The suppliers BatiNode picks for a request: those covering its category at the
 * closest postal prefix first, then those asked least recently, so the same
 * suppliers are not always the ones solicited. Only suppliers with an e-mail
 * address who did not unsubscribe, never one already invited to this request.
 */
export async function pickSuppliers(admin: SupabaseClient, request: SentRequest, count: number): Promise<string[]> {
  if (count < 1) return [];
  const { data: coverage } = await admin.from('supplier_coverage').select('supplier_id, postal_prefix').eq('category_id', request.category_id);
  const closeness = new Map<string, number>();
  for (const c of coverage ?? []) {
    if (!request.postal_code.startsWith(c.postal_prefix)) continue;
    closeness.set(c.supplier_id, Math.max(closeness.get(c.supplier_id) ?? 0, c.postal_prefix.length));
  }
  if (!closeness.size) return [];
  const ids = [...closeness.keys()];
  const [{ data: reachable }, { data: invited }, { data: recent }] = await Promise.all([
    admin.from('companies').select('id, email, quote_email, verified_at').in('id', ids).eq('kind', 'supplier').is('requests_stopped_at', null),
    admin.from('quotes').select('supplier_id').eq('request_id', request.id),
    admin.from('quotes').select('supplier_id, created_at').in('supplier_id', ids).order('created_at', { ascending: false }).limit(1000),
  ]);
  const already = new Set((invited ?? []).map((q) => q.supplier_id));
  const lastAsked = new Map<string, string>();
  for (const q of recent ?? []) if (!lastAsked.has(q.supplier_id)) lastAsked.set(q.supplier_id, q.created_at);
  const shuffle = new Map(ids.map((id) => [id, Math.random()]));
  return (reachable ?? [])
    .filter((s) => (s.quote_email ?? s.email) && !already.has(s.id))
    .sort(
      (a, b) =>
        closeness.get(b.id)! - closeness.get(a.id)! ||
        (lastAsked.get(a.id) ?? '').localeCompare(lastAsked.get(b.id) ?? '') ||
        Number(Boolean(b.verified_at)) - Number(Boolean(a.verified_at)) ||
        shuffle.get(a.id)! - shuffle.get(b.id)!,
    )
    .slice(0, count)
    .map((s) => s.id);
}
