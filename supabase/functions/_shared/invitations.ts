// Invites suppliers to quote on a sent price request: one quote row and one e-mail
// with a personal reply link each. Used when the contractor sends the request and
// when the BatiNode team adds suppliers to a request it looks after.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { SUPPLIER_COMMISSION_ACTIVE } from './commission.ts';
import { contractorAddress, invitationMail, sendMail, type Lang } from './email.ts';
import { relayAddress } from './relay-address.ts';
import { appUrl } from './supabase.ts';
import { isTestCompany, testMail } from './test-mode.ts';
import { hashToken, newToken, tokenExpiry } from './tokens.ts';

export { AUTO_SUPPLIERS } from './plans.ts';

export type SentRequest = {
  id: string;
  company_id: string;
  title: string;
  category_id: number | null;
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

  const test = await isTestCompany(admin, request.company_id);
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
      const mail = invitationMail({
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
      });
      await sendMail(test ? testMail(mail) : mail);
      sent.push(supplier.id);
    } catch (e) {
      console.error(e);
      failed.push(supplier.id);
    }
  }
  return { sent, failed };
}

/**
 * The suppliers BatiNode picks for a request: those of its category within 50 km of
 * the site, nearest first (in 10 km bands), then those asked least recently, so the
 * same suppliers are not always the ones solicited. Only suppliers with an e-mail
 * address who did not unsubscribe, never one already invited to this request.
 */
export async function pickSuppliers(admin: SupabaseClient, request: SentRequest, count: number): Promise<string[]> {
  if (count < 1) return [];
  // Suppliers of the category within 50 km of the site, nearest first (public.nearby_suppliers).
  const { data: near } = await admin.rpc('nearby_suppliers', { p_postal: request.postal_code, p_category: request.category_id });
  const distance = new Map(((near ?? []) as { id: string; km: number | null }[]).map((n) => [n.id, n.km ?? 999]));
  if (!distance.size) return [];
  const ids = [...distance.keys()];
  const [{ data: reachable }, { data: invited }, { data: recent }, { data: coverage }] = await Promise.all([
    admin.from('companies').select('id, email, quote_email, verified_at').in('id', ids).eq('kind', 'supplier').is('requests_stopped_at', null),
    admin.from('quotes').select('supplier_id').eq('request_id', request.id),
    admin.from('quotes').select('supplier_id, created_at').in('supplier_id', ids).order('created_at', { ascending: false }).limit(1000),
    admin.from('supplier_coverage').select('supplier_id, category_id').in('supplier_id', ids),
  ]);
  const already = new Set((invited ?? []).map((q) => q.supplier_id));
  const lastAsked = new Map<string, string>();
  for (const q of recent ?? []) if (!lastAsked.has(q.supplier_id)) lastAsked.set(q.supplier_id, q.created_at);
  // Without a category, general merchants (many categories) come before specialists.
  const breadth = new Map<string, Set<number>>();
  for (const c of coverage ?? []) breadth.set(c.supplier_id, (breadth.get(c.supplier_id) ?? new Set()).add(c.category_id));
  const shuffle = new Map(ids.map((id) => [id, Math.random()]));
  // Within 10 km of each other, suppliers count as equally close.
  const band = (id: string) => Math.floor(distance.get(id)! / 10);
  return (reachable ?? [])
    .filter((s) => (s.quote_email ?? s.email) && !already.has(s.id))
    .sort(
      (a, b) =>
        band(a.id) - band(b.id) ||
        (request.category_id === null ? (breadth.get(b.id)?.size ?? 0) - (breadth.get(a.id)?.size ?? 0) : 0) ||
        (lastAsked.get(a.id) ?? '').localeCompare(lastAsked.get(b.id) ?? '') ||
        Number(Boolean(b.verified_at)) - Number(Boolean(a.verified_at)) ||
        shuffle.get(a.id)! - shuffle.get(b.id)!,
    )
    .map((s) => s.id)
    .slice(0, count);
}
