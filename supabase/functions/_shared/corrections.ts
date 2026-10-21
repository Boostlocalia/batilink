// An offer whose product is not the one asked for (glass wool instead of stone wool,
// another thickness): the offer stays in the client's comparison, and BatiNode asks the
// supplier by e-mail to price the right product. The supplier's new PDF is read again:
// still wrong, they are told once more; right, the client hears the corrected offer.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { eur, notice, sendMail, type Lang } from './email.ts';
import { logEvent } from './events.ts';
import { relayAddress } from './relay-address.ts';
import { appUrl } from './supabase.ts';
import { isTestCompany, testMail } from './test-mode.ts';
import { hashToken, newToken } from './tokens.ts';

const LINK_DAYS = 7;
const MAX_CORRECTIONS = 2;

export type Followed = 'asked' | 'asked_again' | 'corrected' | null;

type Row = {
  id: string;
  reply_key: string;
  corrections: number;
  correction_requested_at: string | null;
  supplier: { name: string; email: string | null; quote_email: string | null; language: Lang } | null;
  total_ex_vat: number | null;
  request: { id: string; title: string; status: string; company_id: string; company: { email: string | null; language: Lang } | null };
  quote_items: { mismatch: string | null; item: { label: string } | null }[];
};

/**
 * Called after each reading of an offer. A product difference asks the supplier to correct
 * it (the client is told the first time); a difference that is gone after a correction
 * was asked tells the client the offer is corrected.
 */
export async function followUpMaterials(admin: SupabaseClient, quoteId: string): Promise<Followed> {
  const { data } = await admin
    .from('quotes')
    .select(
      'id, reply_key, corrections, correction_requested_at, total_ex_vat, supplier:companies(name, email, quote_email, language), request:price_requests!inner(id, title, status, company_id, company:companies(email, language)), quote_items(mismatch, item:request_items(label))',
    )
    .eq('id', quoteId)
    .in('status', ['invited', 'submitted'])
    .maybeSingle();
  const quote = data as unknown as Row | null;
  if (!quote || quote.request.status !== 'sent') return null;
  const wrong = quote.quote_items.filter((i) => i.mismatch).map((i) => `${i.item?.label ?? ''} : ${i.mismatch}`);
  if (!wrong.length) return quote.correction_requested_at ? await tellCorrected(admin, quote) : null;
  if (quote.corrections >= MAX_CORRECTIONS) return null;

  // Claimed first, so two readings of the same offer never send two e-mails.
  const { data: claimed } = await admin
    .from('quotes')
    .update({ correction_requested_at: new Date().toISOString(), corrections: quote.corrections + 1 })
    .eq('id', quote.id)
    .eq('corrections', quote.corrections)
    .select('id');
  if (!claimed?.length) return null;
  const again = quote.corrections > 0;

  const token = newToken();
  await admin.from('quote_links').insert({
    token_hash: await hashToken(token),
    quote_id: quote.id,
    expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString(),
  });
  const offerUrl = `${appUrl()}/offre/${token}`;
  const test = await isTestCompany(admin, quote.request.company_id);
  const supplierTo = quote.supplier?.quote_email ?? quote.supplier?.email;
  const list = wrong.map((w) => `- ${w}`).join('\n');

  if (supplierTo) {
    const mail = notice(quote.supplier!.language ?? 'fr', supplierTo, {
      fr: {
        subject: `Produit à corriger : ${quote.request.title}`,
        paragraphs: [
          'Bonjour,',
          again
            ? `Merci pour votre nouvelle offre. Ce n'est toujours pas le bon matériau :\n${list}`
            : `Merci pour votre offre. Le produit proposé ne correspond pas à celui demandé :\n${list}`,
          'Pouvez-vous nous envoyer une offre pour le produit demandé ? Répondez simplement à cet e-mail avec votre devis en PDF, ou remplacez-le en ligne.',
        ],
        cta: { label: "Corriger l'offre", url: offerUrl },
      },
      nl: {
        subject: `Product te corrigeren: ${quote.request.title}`,
        paragraphs: [
          'Goeiedag,',
          again
            ? `Bedankt voor uw nieuwe offerte. Het is nog altijd niet het juiste materiaal:\n${list}`
            : `Bedankt voor uw offerte. Het aangeboden product komt niet overeen met het gevraagde:\n${list}`,
          'Kunt u ons een offerte sturen voor het gevraagde product? Beantwoord gewoon deze e-mail met uw offerte in pdf, of vervang ze online.',
        ],
        cta: { label: 'Offerte corrigeren', url: offerUrl },
      },
    });
    const withReply = { ...mail, replyTo: relayAddress('supplier', quote.reply_key, Deno.env.get('RELAY_EMAIL_DOMAIN') ?? undefined) };
    await sendMail(test ? testMail(withReply) : withReply).catch(console.error);
  }

  // The client already knows a correction was asked: told once.
  const contractorTo = again ? null : quote.request.company?.email;
  if (contractorTo) {
    const supplier = quote.supplier?.name ?? '';
    const total = quote.total_ex_vat === null ? null : Number(quote.total_ex_vat);
    await sendMail(
      notice(quote.request.company!.language ?? 'fr', contractorTo, {
        fr: {
          subject: `Nouvelle offre : ${quote.request.title}`,
          paragraphs: [
            `Vous avez reçu l'offre de ${supplier}${total ? ` : ${eur(total, 'fr')} HTVA` : ''}. Elle est déjà dans votre comparatif.`,
            `Pour ce produit, le matériau proposé ne correspond pas à votre demande :\n${list}`,
            "BatiNode a relancé le fournisseur pour qu'il chiffre le bon produit. Vous serez prévenu dès que l'offre corrigée arrive.",
          ],
          cta: { label: 'Voir la demande', url: `${appUrl()}/demande/${quote.request.id}` },
        },
        nl: {
          subject: `Nieuwe offerte: ${quote.request.title}`,
          paragraphs: [
            `U hebt de offerte van ${supplier} ontvangen${total ? `: ${eur(total, 'nl')} excl. btw` : ''}. Ze staat al in uw vergelijking.`,
            `Voor dit product komt het aangeboden materiaal niet overeen met uw aanvraag:\n${list}`,
            'BatiNode heeft de leverancier opnieuw gevraagd het juiste product te prijzen. U wordt verwittigd zodra de gecorrigeerde offerte binnen is.',
          ],
          cta: { label: 'Aanvraag bekijken', url: `${appUrl()}/demande/${quote.request.id}` },
        },
      }),
    ).catch(console.error);
  }

  await logEvent(admin, { kind: 'correction_requested', request_id: quote.request.id, quote_id: quote.id, data: { lines: wrong.length, again } });
  return again ? 'asked_again' : 'asked';
}

async function tellCorrected(admin: SupabaseClient, quote: Row): Promise<Followed> {
  const { data: claimed } = await admin
    .from('quotes')
    .update({ correction_requested_at: null })
    .eq('id', quote.id)
    .not('correction_requested_at', 'is', null)
    .select('total_ex_vat');
  if (!claimed?.length) return null;
  const to = quote.request.company?.email;
  if (to) {
    const supplier = quote.supplier?.name ?? '';
    const total = claimed[0].total_ex_vat === null ? null : Number(claimed[0].total_ex_vat);
    const url = `${appUrl()}/demande/${quote.request.id}`;
    await sendMail(
      notice(quote.request.company!.language ?? 'fr', to, {
        fr: {
          subject: `Offre corrigée : ${quote.request.title}`,
          paragraphs: [`${supplier} a corrigé son offre avec le bon produit${total ? ` : ${eur(total, 'fr')} HTVA` : ''}. Votre comparatif est à jour.`],
          cta: { label: 'Voir la demande', url },
        },
        nl: {
          subject: `Offerte gecorrigeerd: ${quote.request.title}`,
          paragraphs: [`${supplier} heeft zijn offerte gecorrigeerd met het juiste product${total ? `: ${eur(total, 'nl')} excl. btw` : ''}. Uw vergelijking is bijgewerkt.`],
          cta: { label: 'Aanvraag bekijken', url },
        },
      }),
    ).catch(console.error);
  }
  await logEvent(admin, { kind: 'correction_received', request_id: quote.request.id, quote_id: quote.id });
  return 'corrected';
}

/** Safety net: offers with a product difference that no reading has followed up yet. */
export async function requestCorrections(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from('quote_items')
    .select('quote_id, quote:quotes!inner(corrections, status)')
    .not('mismatch', 'is', null)
    .eq('quote.corrections', 0)
    .in('quote.status', ['invited', 'submitted'])
    .limit(20);
  let asked = 0;
  for (const id of new Set((data ?? []).map((r) => r.quote_id))) if (await followUpMaterials(admin, id)) asked++;
  return asked;
}
