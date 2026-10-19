// Webhook for e-mails sent to the relay addresses (Brevo inbound parsing, set up
// on the reply domain's MX). Protected by a shared secret in the URL:
//   https://<project>.functions.supabase.co/inbound-email?secret=<INBOUND_EMAIL_SECRET>
// Each e-mail is checked against the quote's supplier or contractor, then relayed.

import { logEvent } from '../_shared/events.ts';
import { sameSecret } from '../_shared/limits.ts';
import { parseRelayAddress, senderMatches, stripQuoted } from '../_shared/relay-address.ts';
import { relayMessage } from '../_shared/relay.ts';
import { adminClient, json } from '../_shared/supabase.ts';

type Address = { Name?: string | null; Address?: string | null };
type InboundItem = {
  MessageId?: string;
  From?: Address;
  To?: Address[];
  Cc?: Address[];
  Recipients?: string[];
  Subject?: string;
  RawTextBody?: string;
  ExtractedMarkdownMessage?: string;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('INBOUND_EMAIL_SECRET');
  if (!(await sameSecret(new URL(req.url).searchParams.get('secret'), secret))) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const domain = Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined;
  const { items = [] } = (await req.json()) as { items?: InboundItem[] };
  const results: string[] = [];

  for (const item of items) {
    const recipients = [
      ...(item.Recipients ?? []),
      ...[...(item.To ?? []), ...(item.Cc ?? [])].map((a) => a.Address ?? ''),
    ].filter(Boolean);
    const target = parseRelayAddress(recipients, domain);
    const from = item.From?.Address ?? '';
    if (!target || !from) {
      results.push('no_relay_address');
      continue;
    }

    const { data: quote } = await admin
      .from('quotes')
      .select('id, request_id, supplier:companies(email), request:price_requests(status, company:companies(email))')
      .eq('reply_key', target.replyKey)
      .maybeSingle();
    if (!quote) {
      results.push('unknown_quote');
      continue;
    }
    const request = quote.request as unknown as { status: string; company: { email: string | null } };
    const expected =
      target.author === 'supplier'
        ? (quote.supplier as unknown as { email: string | null }).email
        : request.company.email;

    // Someone else writing to a relay address is not relayed, only logged.
    if (!senderMatches(from, expected) || !['sent', 'awarded'].includes(request.status)) {
      await logEvent(admin, {
        kind: 'inbound_rejected',
        request_id: quote.request_id,
        quote_id: quote.id,
        data: { reason: request.status === 'sent' || request.status === 'awarded' ? 'sender' : 'status', author: target.author },
      });
      results.push('rejected');
      continue;
    }

    const body = stripQuoted(item.ExtractedMarkdownMessage || item.RawTextBody || '');
    const result = await relayMessage(admin, {
      quoteId: quote.id,
      author: target.author,
      channel: 'email',
      body,
      senderEmail: from,
      sourceMessageId: item.MessageId ?? null,
    });
    results.push(result.status);
  }

  // Always 200 once authenticated, so the provider does not retry rejected mail forever.
  return json({ results });
});
