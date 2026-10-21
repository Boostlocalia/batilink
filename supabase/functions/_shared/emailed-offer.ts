// A supplier who simply replies to the price request with their quote as a PDF:
// the PDF is fetched from Brevo, stored on the offer, and Nodi reads its prices.
// When every requested item is priced the offer counts as submitted; otherwise the
// contractor still sees the PDF next to the waiting offer.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { offerTotalExVat } from './commission.ts';
import { newQuoteMail, sendMail, type Lang } from './email.ts';
import { logEvent } from './events.ts';
import { readOfferPdf } from './offer-pdf.ts';
import { appUrl } from './supabase.ts';

export type EmailedFile = { name: string; contentType: string; downloadToken: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const BREVO = 'https://api.brevo.com/v3';

const isPdf = (f: EmailedFile) => f.contentType.toLowerCase().includes('pdf') || f.name.toLowerCase().endsWith('.pdf');

async function brevo(path: string): Promise<Response | null> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return null;
  const res = await fetch(`${BREVO}${path}`, { headers: { 'api-key': apiKey } });
  if (!res.ok) {
    console.error('brevo inbound', path.split('?')[0].split('/').slice(0, 3).join('/'), res.status, (await res.text()).slice(0, 300));
    return null;
  }
  return res;
}

/** Attachments of a webhook item or of an inbound event, whatever the key casing. */
export function emailedFiles(source: unknown): EmailedFile[] {
  const found: EmailedFile[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const token = o.DownloadToken ?? o.downloadToken;
    if (typeof token === 'string' && token) {
      found.push({
        name: String(o.Name ?? o.name ?? ''),
        contentType: String(o.ContentType ?? o.contentType ?? ''),
        downloadToken: token,
      });
      return;
    }
    Object.values(o).forEach(visit);
  };
  visit(source);
  return found;
}

/** Stores the first PDF of a supplier's e-mail on their offer. Returns what happened. */
export async function saveEmailedOffer(admin: SupabaseClient, quoteId: string, files: EmailedFile[]): Promise<'no_pdf' | 'closed' | 'failed' | 'attached' | 'submitted'> {
  const file = files.find(isPdf);
  if (!file) return 'no_pdf';

  const { data: quote } = await admin
    .from('quotes')
    .select('id, status, supplier_id, offer_reads, supplier:companies(name), request:price_requests(id, title, status, company:companies(email, language))')
    .eq('id', quoteId)
    .single();
  const request = quote?.request as unknown as { id: string; title: string; status: string; company: { email: string | null; language: Lang } } | undefined;
  if (!quote || !request || request.status !== 'sent' || !['invited', 'submitted'].includes(quote.status)) return 'closed';

  const res = await brevo(`/inbound/attachments/${encodeURIComponent(file.downloadToken)}`);
  if (!res) return 'failed';
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return 'failed';

  const path = `${quote.id}/${crypto.randomUUID()}.pdf`;
  const { error } = await admin.storage.from('quote-files').upload(path, bytes, { contentType: 'application/pdf' });
  if (error) return 'failed';
  await admin.from('quotes').update({ offer_file_path: path, offer_reads: quote.offer_reads + 1 }).eq('id', quote.id);

  // Nodi reads the prices; the offer is submitted only when every item has one.
  const { data: items } = await admin.from('request_items').select('id, label, quantity, unit').eq('request_id', request.id).order('position');
  const requested = (items ?? []).map((i) => ({ id: i.id, label: i.label, quantity: Number(i.quantity), unit: i.unit }));
  const reading = await readOfferPdf(bytes, requested, new Date().toISOString().slice(0, 10));
  const prices = new Map((reading?.items ?? []).filter((i) => i.unit_price !== null).map((i) => [i.item_id, i.unit_price as number]));
  const complete = quote.status === 'invited' && requested.length > 0 && requested.every((i) => prices.has(i.id));

  if (complete) {
    const deliveryFee = reading?.delivery_fee ?? 0;
    await admin.from('quote_items').upsert(requested.map((i) => ({ quote_id: quote.id, item_id: i.id, unit_price: prices.get(i.id)! })));
    const total = offerTotalExVat(
      requested.map((i) => ({ quantity: i.quantity, unitPrice: prices.get(i.id)! })),
      deliveryFee,
    );
    await admin
      .from('quotes')
      .update({
        status: 'submitted',
        delivery_fee: deliveryFee,
        lead_time_days: reading?.lead_time_days ?? null,
        valid_until: reading?.valid_until ?? null,
        submitted_at: new Date().toISOString(),
        total_ex_vat: total,
      })
      .eq('id', quote.id)
      .eq('status', 'invited');
    await logEvent(admin, { kind: 'quote_submitted', company_id: quote.supplier_id, request_id: request.id, quote_id: quote.id, data: { total_ex_vat: total, via: 'email' } });
  }

  // The contractor hears about the offer once, when it first arrives.
  if (quote.status === 'invited' && quote.offer_reads === 0 && request.company.email) {
    const supplier = (quote.supplier as unknown as { name: string } | null)?.name ?? '';
    await sendMail(newQuoteMail(request.company.language, request.company.email, supplier, request.title, `${appUrl()}/demande/${request.id}`)).catch(console.error);
  }
  return complete ? 'submitted' : 'attached';
}

/**
 * Safety net for e-mails whose PDF was not saved on arrival (before this existed, or
 * when Brevo did not answer): looks the e-mail up again in Brevo's inbound log.
 */
export async function recoverEmailedOffers(admin: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const { data: messages } = await admin
    .from('quote_messages')
    .select('quote_id, sender_email, created_at, quote:quotes!inner(reply_key, status, offer_file_path)')
    .eq('author', 'supplier')
    .eq('channel', 'email')
    .gte('created_at', since.toISOString())
    .is('quote.offer_file_path', null)
    .eq('quote.status', 'invited')
    .limit(20);

  let saved = 0;
  for (const m of messages ?? []) {
    if (!m.sender_email) continue;
    const replyKey = (m.quote as unknown as { reply_key: string }).reply_key;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const sent = new Date(m.created_at);
    // Brevo refuses an end date after today.
    const end = new Date(Math.min(sent.getTime() + 86_400_000, Date.now()));
    const list = await brevo(
      `/inbound/events?sender=${encodeURIComponent(m.sender_email)}&startDate=${day(new Date(sent.getTime() - 86_400_000))}&endDate=${day(end)}&limit=50`,
    );
    const events = list ? (((await list.json()) as { events?: { uuid?: string }[] }).events ?? []) : [];
    for (const e of events) {
      if (!e.uuid) continue;
      const detail = await brevo(`/inbound/events/${encodeURIComponent(e.uuid)}`);
      if (!detail) continue;
      const body = await detail.json();
      // Only the e-mail sent to this offer's relay address.
      if (!JSON.stringify(body).toLowerCase().includes(replyKey)) continue;
      const result = await saveEmailedOffer(admin, m.quote_id, emailedFiles(body));
      if (result === 'attached' || result === 'submitted') {
        saved++;
        break;
      }
    }
  }
  return saved;
}
