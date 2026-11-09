// The contractor answers a supplier's question from the app. The answer is
// relayed by e-mail exactly like one sent by replying to the question e-mail.

import { relayMessage, MAX_BODY } from '../_shared/relay.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);

  const { quote_id: quoteId, body } = (await req.json()) as { quote_id: string; body: string };
  if (typeof body !== 'string' || !body.trim() || body.length > MAX_BODY) return json({ error: 'invalid_body' }, 400);

  const { data: quote } = await admin
    .from('quotes')
    .select('id, request:price_requests(company_id, status)')
    .eq('id', quoteId)
    .maybeSingle();
  const request = quote?.request as unknown as { company_id: string; status: string } | undefined;
  if (!quote || request?.company_id !== companyId) return json({ error: 'not_found' }, 404);
  if (!['sent', 'awarded'].includes(request.status)) return json({ error: 'closed' }, 409);

  const result = await relayMessage(admin, { quoteId: quote.id, author: 'contractor', channel: 'app', body });
  return json(result, result.status === 'not_found' ? 404 : result.status === 'limited' ? 429 : 200);
});
