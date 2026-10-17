// Run hourly by a cron job (see README). Reminds suppliers who have not answered
// 24 h after the invitation, once, and closes requests past their reply date.
// Only the stored hash of a reply link is known, so a reminder carries a fresh link.

import { invitationMail, sendMail, type Lang } from '../_shared/email.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';
import { hashToken, newToken, tokenExpiry } from '../_shared/tokens.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = adminClient();
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
      'id, supplier:companies(email, language), request:price_requests!inner(id, title, postal_code, city, needed_by, reply_by, fulfilment, status, company:companies(name, verified_at))',
    )
    .eq('status', 'invited')
    .is('reminded_at', null)
    .lt('created_at', dayAgo)
    .eq('request.status', 'sent');

  let reminded = 0;
  for (const q of due ?? []) {
    const supplier = q.supplier as unknown as { email: string | null; language: Lang } | null;
    const request = q.request as unknown as {
      id: string;
      title: string;
      postal_code: string;
      city: string | null;
      needed_by: string | null;
      reply_by: string;
      fulfilment: string;
      company: { name: string; verified_at: string | null } | null;
    };
    if (!supplier?.email) continue;
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
          to: supplier.email,
          contractor: request.company?.name ?? '',
          contractorVerified: Boolean(request.company?.verified_at),
          title: request.title,
          postalCode: request.postal_code,
          city: request.city,
          items: items ?? [],
          neededBy: request.needed_by,
          replyBy: request.reply_by,
          delivery: request.fulfilment === 'delivery',
          url: `${appUrl()}/offre/${token}`,
        },
        true,
      ),
    )
      .then(() => reminded++)
      .catch(console.error);
  }

  return json({ closed: closed?.length ?? 0, reminded });
});
