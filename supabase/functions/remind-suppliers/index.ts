// Run hourly by a cron job (see README). Reminds suppliers who have not answered
// 24 h after the invitation, once, and closes requests past their reply date.
// Only the stored hash of a reply link is known, so a reminder carries a fresh link.

import { isCron } from '../_shared/cron.ts';
import { SUPPLIER_COMMISSION_ACTIVE } from '../_shared/commission.ts';
import { contractorAddress, invitationMail, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { relayAddress } from '../_shared/relay-address.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';
import { hashToken, newToken, tokenExpiry } from '../_shared/tokens.ts';

Deno.serve(async (req) => {
  const admin = adminClient();
  if (!(await isCron(req, admin))) return json({ error: 'unauthorized' }, 401);
  const today = new Date().toISOString().slice(0, 10);

  const { data: closed } = await admin
    .from('price_requests')
    .update({ status: 'closed' })
    .eq('status', 'sent')
    .lt('reply_by', today)
    .select('id');

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: due } = await admin
    .from('quotes')
    .select(
      'id, reply_key, supplier:companies(email, quote_email, language, commission_rate, requests_stopped_at), request:price_requests!inner(id, title, postal_code, city, needed_by, reply_by, fulfilment, status, company:companies(name, verified_at, vat_number, street, postal_code, city))',
    )
    .eq('status', 'invited')
    .is('reminded_at', null)
    .lt('created_at', dayAgo)
    .eq('request.status', 'sent');

  let reminded = 0;
  for (const q of due ?? []) {
    const supplier = q.supplier as unknown as {
      email: string | null;
      quote_email: string | null;
      language: Lang;
      commission_rate: number;
      requests_stopped_at: string | null;
    } | null;
    const request = q.request as unknown as {
      id: string;
      title: string;
      postal_code: string;
      city: string | null;
      needed_by: string | null;
      reply_by: string;
      fulfilment: string;
      company: {
        name: string;
        verified_at: string | null;
        vat_number: string | null;
        street: string | null;
        postal_code: string | null;
        city: string | null;
      } | null;
    };
    if (!supplier?.email || supplier.requests_stopped_at) continue;
    const token = newToken();
    await admin
      .from('quotes')
      .update({ token_hash: await hashToken(token), token_expires_at: tokenExpiry(), reminded_at: new Date().toISOString() })
      .eq('id', q.id);
    const { data: items } = await admin
      .from('request_items')
      .select('label, quantity, unit')
      .eq('request_id', request.id)
      .order('position');
    await sendMail(
      invitationMail(
        {
          lang: supplier.language,
          to: supplier.quote_email ?? supplier.email,
          contractor: request.company?.name ?? '',
          contractorVerified: Boolean(request.company?.verified_at),
          contractorVat: request.company?.vat_number ?? null,
          contractorAddress: contractorAddress(request.company),
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
          replyTo: relayAddress('supplier', q.reply_key, Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined),
        },
        true,
      ),
    )
      .then(() => reminded++)
      .catch(console.error);
  }

  if (closed?.length) await logEvent(admin, { kind: 'requests_closed', data: { count: closed.length } });
  if (reminded) await logEvent(admin, { kind: 'supplier_reminded', data: { count: reminded } });
  return json({ closed: closed?.length ?? 0, reminded });
});
