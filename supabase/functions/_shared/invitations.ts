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
  const [{ data: items }, { data: contractor }, { data: suppliers }, { data: details }] = await Promise.all([
    admin.from('request_items').select('label, quantity, unit').eq('request_id', request.id).order('position'),
    admin.from('companies').select('name, contact_name, verified_at, vat_number, street, postal_code, city').eq('id', request.company_id).single(),
    // Suppliers who unsubscribed from request e-mails are skipped.
    admin.from('companies').select('id, email, quote_email, language, commission_rate').in('id', supplierIds).eq('kind', 'supplier').is('requests_stopped_at', null),
    admin.from('price_requests').select('note').eq('id', request.id).single(),
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
          contactName: contractor?.contact_name ?? null,
          note: details?.note ?? null,
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
 * The suppliers BatiNode picks for a request: those of its category within 50 km of (25 km for pickup at the shop)
 * the site, nearest first (in 10 km bands), then those asked least recently, so the
 * same suppliers are not always the ones solicited. Only suppliers with an e-mail
 * address who did not unsubscribe, never one already invited to this request.
 */
export async function pickSuppliers(admin: SupabaseClient, request: SentRequest, count: number): Promise<string[]> {
  if (count < 1) return [];
  // Suppliers of the category within 50 km of the site, nearest first, ranked in the database (public.pick_suppliers).
  const { data, error } = await admin.rpc('pick_suppliers', { p_request_id: request.id, p_count: count });
  if (error) console.error('pick_suppliers', error.message);
  return ((data ?? []) as string[]).filter((id) => typeof id === 'string');
}
