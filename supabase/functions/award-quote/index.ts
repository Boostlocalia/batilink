// The contractor picks one offer: it is marked awarded, the others not_selected,
// and every supplier who answered is told by e-mail.

import { awardedMail, notSelectedMail, sendMail, type Lang } from '../_shared/email.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { quote_id: quoteId } = (await req.json()) as { quote_id: string };
  const { data: quote } = await admin.from('quotes').select('id, request_id, status').eq('id', quoteId).single();
  if (!quote) return json({ error: 'not_found' }, 404);
  const { data: request } = await admin
    .from('price_requests')
    .select('id, title, status, company_id')
    .eq('id', quote.request_id)
    .single();
  if (!request || request.company_id !== companyId) return json({ error: 'not_found' }, 404);
  if (request.status !== 'sent' || quote.status !== 'submitted') return json({ error: 'not_awardable' }, 409);

  const { data: flipped } = await admin
    .from('price_requests')
    .update({ status: 'awarded' })
    .eq('id', request.id)
    .eq('status', 'sent')
    .select('id');
  if (!flipped?.length) return json({ error: 'not_awardable' }, 409);

  await admin.from('quotes').update({ status: 'awarded' }).eq('id', quote.id);
  await admin
    .from('quotes')
    .update({ status: 'not_selected' })
    .eq('request_id', request.id)
    .neq('id', quote.id)
    .in('status', ['invited', 'submitted']);

  const [{ data: contractor }, { data: answered }] = await Promise.all([
    admin.from('companies').select('name, email').eq('id', companyId).single(),
    admin
      .from('quotes')
      .select('id, supplier:companies(email, language)')
      .eq('request_id', request.id)
      .not('submitted_at', 'is', null),
  ]);
  for (const q of answered ?? []) {
    const supplier = q.supplier as unknown as { email: string | null; language: Lang } | null;
    if (!supplier?.email) continue;
    const mail =
      q.id === quote.id
        ? awardedMail(supplier.language, supplier.email, contractor?.name ?? '', contractor?.email ?? null, request.title)
        : notSelectedMail(supplier.language, supplier.email, contractor?.name ?? '', request.title);
    await sendMail(mail).catch(console.error);
  }
  return json({ ok: true });
});
