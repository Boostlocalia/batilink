// Webhook for e-mails sent to the relay addresses (Brevo inbound parsing, set up
// on the reply domain's MX). Protected by a shared secret in the URL:
//   https://<project>.functions.supabase.co/inbound-email?secret=<INBOUND_EMAIL_SECRET>
// Each e-mail is checked against the quote's supplier or contractor, then relayed.
// support@ also sends a copy here: a supplier's PDF sent there lands on their offer.

import { emailedFiles, placeEmailedOffers, saveEmailedOffer } from '../_shared/emailed-offer.ts';
import { logEvent } from '../_shared/events.ts';
import { sameSecret } from '../_shared/limits.ts';
import { DEFAULT_RELAY_DOMAIN, parseRelayAddress, senderMatches, stripQuoted } from '../_shared/relay-address.ts';
import { relayMessage } from '../_shared/relay.ts';
import { adminClient, json } from '../_shared/supabase.ts';
import { isSupportCopy, pickOpenQuote, quotedReferences } from '../_shared/support-inbox.ts';
import { hashToken } from '../_shared/tokens.ts';

type Address = { Name?: string | null; Address?: string | null };
type InboundItem = {
  MessageId?: string;
  From?: Address;
  To?: Address[];
  Cc?: Address[];
  Recipients?: string[];
  Subject?: string;
  RawTextBody?: string;
  RawHtmlBody?: string;
  ExtractedMarkdownMessage?: string;
  Attachments?: unknown[];
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
    const recipients = [...(item.Recipients ?? []), ...[...(item.To ?? []), ...(item.Cc ?? [])].map((a) => a.Address ?? '')].filter(Boolean);
    const target = parseRelayAddress(recipients, domain);
    const from = item.From?.Address ?? '';
    if (!target && from && isSupportCopy(recipients, domain ?? DEFAULT_RELAY_DOMAIN, Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be')) {
      results.push(await supportCopy(admin, item, from, domain ?? DEFAULT_RELAY_DOMAIN));
      continue;
    }
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
    const expected = target.author === 'supplier' ? (quote.supplier as unknown as { email: string | null }).email : request.company.email;

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
    // A supplier who replies with their quote as a PDF: it becomes their offer.
    const offer = target.author === 'supplier' ? await saveEmailedOffer(admin, quote.id, emailedFiles(item.Attachments ?? [])) : 'no_pdf';
    results.push(offer === 'no_pdf' ? result.status : `${result.status}+${offer}`);
  }

  // Always 200 once authenticated, so the provider does not retry rejected mail forever.
  return json({ results });
});

type Admin = ReturnType<typeof adminClient>;
type Candidate = { id: string; request_id: string; created_at: string; supplier: { email: string | null }; request: { title: string; status: string } };
const CANDIDATE = 'id, request_id, created_at, supplier:companies!inner(email), request:price_requests!inner(title, status)';

/**
 * An e-mail to support@ (often a forward of our request, which drops the Reply-To).
 * Only a PDF from a supplier's own company is used; anything else stays in the mailbox.
 */
async function supportCopy(admin: Admin, item: InboundItem, from: string, domain: string): Promise<string> {
  const files = emailedFiles(item.Attachments ?? []);
  if (!files.some((f) => f.contentType.toLowerCase().includes('pdf') || f.name.toLowerCase().endsWith('.pdf'))) return 'support_no_pdf';
  const text = [item.Subject, item.RawTextBody, item.RawHtmlBody].filter(Boolean).join('\n');

  // Our own request, quoted in the forward, names the offer exactly.
  const refs = quotedReferences(text, domain);
  const found: Candidate[] = [];
  if (refs.replyKeys.length) {
    const { data } = await admin.from('quotes').select(CANDIDATE).in('reply_key', refs.replyKeys.slice(0, 5));
    found.push(...((data ?? []) as unknown as Candidate[]));
  }
  for (const token of refs.tokens.slice(0, 5)) {
    const hash = await hashToken(token);
    const { data: link } = await admin.from('quote_links').select('quote_id').eq('token_hash', hash).maybeSingle();
    const query = admin.from('quotes').select(CANDIDATE);
    const { data } = await (link ? query.eq('id', link.quote_id) : query.eq('token_hash', hash)).maybeSingle();
    if (data) found.push(data as unknown as Candidate);
  }
  // The sender's open offers: same address, or a colleague at the same company.
  const senderDomain = from.split('@')[1]?.toLowerCase() ?? '';
  const { data } = await admin
    .from('quotes')
    .select(CANDIDATE)
    .in('status', ['invited', 'submitted'])
    .eq('request.status', 'sent')
    .ilike('supplier.email', `%@${senderDomain.replace(/[%_]/g, '')}`)
    .limit(50);
  const open = ((data ?? []) as unknown as Candidate[]).filter((q) => senderMatches(from, q.supplier.email));
  const quoted = found.find((q) => q.request.status === 'sent' && senderMatches(from, q.supplier.email));
  const picked = pickOpenQuote(
    from,
    text,
    open.map((q) => ({ id: q.id, supplierEmail: q.supplier.email, title: q.request.title, invitedAt: q.created_at })),
  );
  const guess = quoted ?? open.find((q) => q.id === picked?.id);
  if (!guess) return 'support_unmatched';

  // Each PDF goes to the request its lines answer; the quoted request is the fallback.
  const pool = [guess.id, ...open.filter((q) => q.id !== guess.id).map((q) => q.id)];
  const placed = await placeEmailedOffers(admin, pool, guess.id, files);
  const quoteId = placed.quotes[0] ?? guess.id;
  const requestId = open.find((q) => q.id === quoteId)?.request_id ?? guess.request_id;
  const body = stripQuoted(item.ExtractedMarkdownMessage || item.RawTextBody || '');
  await relayMessage(admin, { quoteId, author: 'supplier', channel: 'email', body, senderEmail: from, sourceMessageId: item.MessageId ?? null });
  await logEvent(admin, { kind: 'offer_via_support', request_id: requestId, quote_id: quoteId, data: { offer: placed.result, quotes: placed.quotes } });
  return `support+${placed.result}`;
}
