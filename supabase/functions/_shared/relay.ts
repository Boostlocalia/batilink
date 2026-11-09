// Relays one message between a supplier and the contractor of a quote: the AI step
// reads it, it is stored, and the other side gets it by e-mail in their language.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { understandMessage } from './ai.ts';
import { answerToSupplierMail, questionToContractorMail, sendMail, type Lang } from './email.ts';
import { logEvent } from './events.ts';
import { relayAddress, type Author } from './relay-address.ts';
import { appUrl } from './supabase.ts';

export const MAX_BODY = 20000;

export type RelayInput = {
  quoteId: string;
  author: Author;
  channel: 'email' | 'app';
  body: string;
  senderEmail?: string | null;
  sourceMessageId?: string | null;
};

export type RelayResult = { status: 'relayed' | 'ignored' | 'duplicate' | 'not_found' | 'limited'; kind?: string };

/** Each message is an AI call and an e-mail to the other party: a conversation, not a flood. */
const MESSAGES_PER_HOUR = 10;

export async function relayMessage(admin: SupabaseClient, input: RelayInput): Promise<RelayResult> {
  const body = input.body.trim().slice(0, MAX_BODY);
  if (!body) return { status: 'ignored' };
  if (input.sourceMessageId) {
    const { data: seen } = await admin.from('quote_messages').select('id').eq('source_message_id', input.sourceMessageId).maybeSingle();
    if (seen) return { status: 'duplicate' };
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await admin
    .from('quote_messages')
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', input.quoteId)
    .eq('author', input.author)
    .gte('created_at', since);
  if ((recent ?? 0) >= MESSAGES_PER_HOUR) return { status: 'limited' };

  const { data: quote } = await admin
    .from('quotes')
    .select(
      'id, request_id, reply_key, supplier:companies(name, email, language), request:price_requests(id, title, note, company:companies(name, email, language))',
    )
    .eq('id', input.quoteId)
    .single();
  if (!quote) return { status: 'not_found' };
  const supplier = quote.supplier as unknown as { name: string; email: string | null; language: Lang };
  const request = quote.request as unknown as {
    id: string;
    title: string;
    note: string | null;
    company: { name: string; email: string | null; language: Lang };
  };
  const contractor = request.company;
  const recipient = input.author === 'supplier' ? contractor : supplier;

  const [{ data: items }, { data: earlier }] = await Promise.all([
    admin.from('request_items').select('label, quantity, unit').eq('request_id', request.id).order('position'),
    admin
      .from('quote_messages')
      .select('author, body, relayed_body')
      .eq('quote_id', quote.id)
      .not('relayed_at', 'is', null)
      .order('created_at')
      .limit(20),
  ]);

  const { result, ai } = await understandMessage({
    author: input.author,
    recipientLang: recipient.language,
    body,
    request: { title: request.title, note: request.note, items: (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })) },
    history: (earlier ?? []).map((m) => ({ author: m.author as Author, text: m.body })),
  });
  const relay = ['question', 'answer', 'info'].includes(result.kind) && Boolean(recipient.email);

  const { data: stored, error } = await admin
    .from('quote_messages')
    .insert({
      quote_id: quote.id,
      request_id: request.id,
      author: input.author,
      channel: input.channel,
      kind: result.kind,
      body,
      relayed_body: relay ? result.relayed_body : null,
      item_labels: result.item_labels,
      sender_email: input.senderEmail ?? null,
      source_message_id: input.sourceMessageId ?? null,
    })
    .select('id')
    .single();
  // A unique violation here means a concurrent retry of the same e-mail already stored it.
  if (error || !stored) return { status: error?.code === '23505' ? 'duplicate' : 'not_found' };

  if (relay) {
    const domain = Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined;
    const mail =
      input.author === 'supplier'
        ? questionToContractorMail(
            contractor.language,
            contractor.email!,
            supplier.name,
            request.title,
            result.relayed_body,
            `${appUrl()}/demande/${request.id}`,
            relayAddress('contractor', quote.reply_key, domain),
          )
        : answerToSupplierMail(
            supplier.language,
            supplier.email!,
            contractor.name,
            request.title,
            result.relayed_body,
            relayAddress('supplier', quote.reply_key, domain),
            (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })),
          );
    try {
      await sendMail(mail);
      await admin.from('quote_messages').update({ relayed_at: new Date().toISOString() }).eq('id', stored.id);
    } catch (e) {
      console.error('relay mail', e);
    }
  }

  await logEvent(admin, {
    kind: relay ? 'message_relayed' : 'message_ignored',
    request_id: request.id,
    quote_id: quote.id,
    data: { author: input.author, channel: input.channel, kind: result.kind, ai, items: result.item_labels.length },
  });
  return { status: relay ? 'relayed' : 'ignored', kind: result.kind };
}
