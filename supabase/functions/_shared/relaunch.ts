// 48 h after sending, a request BatiNode looks after that has fewer than 5 answers is
// sent to other suppliers to make up the missing ones, once, with 48 h more to answer.
// The contractor is told the search was relaunched.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { answeredCount, type QuoteState } from './answers.ts';
import { notice, REPLY_HOURS, sendMail, type Lang } from './email.ts';
import { logEvent } from './events.ts';
import { AUTO_SUPPLIERS, inviteSuppliers, pickSuppliers, type SentRequest } from './invitations.ts';
import { appUrl } from './supabase.ts';

export async function relaunchMissing(admin: SupabaseClient): Promise<number> {
  const due = new Date(Date.now() - REPLY_HOURS * 3_600_000).toISOString();
  const { data: requests } = await admin
    .from('price_requests')
    .select('id, company_id, title, category_id, postal_code, city, needed_by, reply_by, fulfilment, quotes(id, status, offer_file_path), company:companies(email, language)')
    .eq('status', 'sent')
    .in('supplier_choice', ['batinode', 'mix'])
    .is('relaunched_at', null)
    .lt('sent_at', due);

  let relaunched = 0;
  for (const r of requests ?? []) {
    const quotes = (r.quotes ?? []) as QuoteState[];
    const { data: messages } = await admin.from('quote_messages').select('quote_id').eq('request_id', r.id).eq('author', 'supplier');
    const answered = answeredCount(quotes, new Set((messages ?? []).map((m) => m.quote_id)));
    const missing = AUTO_SUPPLIERS - answered;
    const now = new Date();
    if (missing <= 0) {
      await admin.from('price_requests').update({ relaunched_at: now.toISOString() }).eq('id', r.id);
      continue;
    }
    const ids = await pickSuppliers(admin, r as unknown as SentRequest, missing);
    const replyBy = new Date(now.getTime() + REPLY_HOURS * 3_600_000).toISOString().slice(0, 10);
    // Claimed first so an overlapping run cannot relaunch twice.
    const { data: claimed } = await admin
      .from('price_requests')
      .update({ relaunched_at: now.toISOString(), ...(ids.length ? { reply_by: replyBy } : {}) })
      .eq('id', r.id)
      .is('relaunched_at', null)
      .select('id');
    if (!claimed?.length || !ids.length) continue;

    const { sent } = await inviteSuppliers(admin, { ...(r as unknown as SentRequest), reply_by: replyBy }, ids);
    if (!sent.length) continue;
    relaunched++;
    await logEvent(admin, { kind: 'request_relaunched', company_id: r.company_id, request_id: r.id, data: { answered, invited: sent.length } });

    const company = r.company as unknown as { email: string | null; language: Lang } | null;
    if (company?.email) {
      const url = `${appUrl()}/demande/${r.id}`;
      const waiting = quotes.length - answered;
      await sendMail(
        notice(company.language, company.email!, {
          fr: {
            subject: `Recherche relancée : ${r.title}`,
            paragraphs: [
              `${answered} fournisseur${answered > 1 ? 's ont' : ' a'} répondu à votre demande « ${r.title} » et ${waiting} n'${waiting > 1 ? 'ont' : 'a'} pas encore répondu.`,
              `Pour vous obtenir plus d'offres, nous avons envoyé votre demande à ${sent.length} autre${sent.length > 1 ? 's' : ''} fournisseur${sent.length > 1 ? 's' : ''}. Ils ont 48 h pour répondre, et les premiers fournisseurs peuvent encore le faire.`,
            ],
            cta: { label: 'Voir ma demande', url },
          },
          nl: {
            subject: `Zoektocht opnieuw gestart: ${r.title}`,
            paragraphs: [
              `${answered} leverancier${answered === 1 ? '' : 's'} antwoordde${answered === 1 ? '' : 'n'} op uw aanvraag « ${r.title} » en ${waiting} nog niet.`,
              `Om u meer offertes te bezorgen, stuurden we uw aanvraag naar ${sent.length} andere leverancier${sent.length === 1 ? '' : 's'}. Zij hebben 48 uur om te antwoorden, en de eerste leveranciers kunnen dat nog altijd.`,
            ],
            cta: { label: 'Mijn aanvraag bekijken', url },
          },
        }),
      ).catch(console.error);
    }
  }
  return relaunched;
}
