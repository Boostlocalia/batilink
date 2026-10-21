// A supplier who simply replies to the price request with their quote as a PDF:
// the PDF is fetched from Brevo, stored on the offer, and Nodi reads its prices.
// When every requested item is priced the offer counts as submitted; otherwise the
// prices it has go into the comparison marked as read from the PDF, to be checked.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { offerTotalExVat } from './commission.ts';
import { newQuoteMail, sendMail, type Lang } from './email.ts';
import { logEvent } from './events.ts';
import { readOfferPdf, whichRequests, type OfferReading, type OpenRequest } from './offer-pdf.ts';
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

const OPEN_REQUEST = 'id, request:price_requests!inner(id, title, status, request_items(id, label, quantity, unit, position))';
type Item = { id: string; label: string; quantity: number; unit: string; position: number };

function asOpenRequest(q: { id: string; request: unknown }): OpenRequest {
  const r = q.request as { title: string; request_items: Item[] };
  return {
    key: q.id,
    title: r.title,
    items: [...r.request_items].sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, label: i.label, quantity: Number(i.quantity), unit: i.unit })),
  };
}

type Placed = 'no_pdf' | 'closed' | 'failed' | 'attached' | 'submitted';
const RANK: Placed[] = ['no_pdf', 'closed', 'failed', 'attached', 'submitted'];
const MAX_PDFS = 3;

async function downloadPdf(file: EmailedFile): Promise<Uint8Array | null> {
  const res = await brevo(`/inbound/attachments/${encodeURIComponent(file.downloadToken)}`);
  if (!res) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length <= MAX_PDF_BYTES && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-' ? bytes : null;
}

/**
 * Puts the PDFs of a supplier's e-mail on the offers they answer. With one open
 * request that is the one; with several, each PDF's lines say which requests it
 * prices (one quote may cover several), and a PDF that is no quote is left aside. `addressed` is the
 * offer the e-mail was sent for, used when the reading cannot tell.
 */
export async function placeEmailedOffers(
  admin: SupabaseClient,
  candidates: string[],
  addressed: string | null,
  files: EmailedFile[],
): Promise<{ result: Placed; quotes: string[] }> {
  const pdfs = files.filter(isPdf).slice(0, MAX_PDFS);
  if (!pdfs.length) return { result: 'no_pdf', quotes: [] };
  const { data: open } = await admin
    .from('quotes')
    .select(OPEN_REQUEST)
    .in('id', [...new Set(candidates)].slice(0, 10))
    .in('status', ['invited', 'submitted'])
    .eq('request.status', 'sent');
  const requests = (open ?? []).map(asOpenRequest);
  if (!requests.length) return { result: 'closed', quotes: [] };

  let best: Placed = 'no_pdf';
  const used = new Set<string>();
  for (const file of pdfs) {
    const bytes = await downloadPdf(file);
    if (!bytes) {
      best = RANK.indexOf('failed') > RANK.indexOf(best) ? 'failed' : best;
      continue;
    }
    let quoteIds = requests.length === 1 ? [requests[0].key] : await whichRequests(bytes, requests);
    // A single PDF the reading cannot place goes to the offer the e-mail was sent for.
    if (!quoteIds.length && pdfs.length === 1 && requests.some((r) => r.key === addressed)) quoteIds = [addressed!];
    for (const quoteId of quoteIds) {
      if (used.has(quoteId)) continue;
      used.add(quoteId);
      const result = await saveOfferPdf(admin, quoteId, bytes);
      if (RANK.indexOf(result) > RANK.indexOf(best)) best = result;
    }
  }
  return { result: best, quotes: [...used] };
}

/**
 * A PDF uploaded on one offer's page that also prices the supplier's other open
 * requests: it goes on those offers too. Returns how many it was added to.
 */
export async function shareOfferPdf(admin: SupabaseClient, quoteId: string, bytes: Uint8Array): Promise<number> {
  const { data: quote } = await admin.from('quotes').select('supplier_id').eq('id', quoteId).single();
  if (!quote) return 0;
  const { data: others } = await admin
    .from('quotes')
    .select(OPEN_REQUEST)
    .eq('supplier_id', quote.supplier_id)
    .eq('status', 'invited')
    .is('offer_file_path', null)
    .eq('request.status', 'sent')
    .neq('id', quoteId)
    .limit(9);
  if (!others?.length) return 0;
  const requests = others.map(asOpenRequest);
  let shared = 0;
  for (const id of await whichRequests(bytes, requests)) {
    if (['attached', 'submitted'].includes(await saveOfferPdf(admin, id, bytes))) shared++;
  }
  return shared;
}

/** A supplier's reply to one offer's relay address: their PDF may still be for another of their open requests. */
export async function saveEmailedOffer(admin: SupabaseClient, quoteId: string, files: EmailedFile[]): Promise<Placed> {
  if (!files.some(isPdf)) return 'no_pdf';
  const { data: quote } = await admin.from('quotes').select('supplier_id').eq('id', quoteId).single();
  const { data: others } = quote
    ? await admin.from('quotes').select('id').eq('supplier_id', quote.supplier_id).in('status', ['invited', 'submitted']).neq('id', quoteId).limit(9)
    : { data: [] };
  return (await placeEmailedOffers(admin, [quoteId, ...(others ?? []).map((o) => o.id)], quoteId, files)).result;
}

/** Stores a PDF on an offer and reads its prices. */
async function saveOfferPdf(admin: SupabaseClient, quoteId: string, bytes: Uint8Array): Promise<Placed> {
  const { data: quote } = await admin
    .from('quotes')
    .select('id, status, supplier_id, offer_reads, comment, supplier:companies(name), request:price_requests(id, title, status, company:companies(email, language))')
    .eq('id', quoteId)
    .single();
  const request = quote?.request as unknown as RequestRow | undefined;
  if (!quote || !request || request.status !== 'sent' || !['invited', 'submitted'].includes(quote.status)) return 'closed';

  const path = `${quote.id}/${crypto.randomUUID()}.pdf`;
  const { error } = await admin.storage.from('quote-files').upload(path, bytes, { contentType: 'application/pdf' });
  if (error) return 'failed';
  await admin
    .from('quotes')
    .update({ offer_file_path: path, offer_reads: quote.offer_reads + 1 })
    .eq('id', quote.id);

  const result = await applyReading(admin, quote as unknown as QuoteRow, request, bytes);
  // The contractor hears about the offer once, when it first arrives.
  if (quote.status === 'invited' && quote.offer_reads === 0) await tellContractor(quote as unknown as QuoteRow, request);
  return result;
}

type QuoteRow = { id: string; status: string; supplier_id: string; offer_reads: number; comment?: string | null; supplier: unknown };
type RequestRow = { id: string; title: string; status: string; company: { email: string | null; language: Lang } };

async function tellContractor(quote: QuoteRow, request: RequestRow) {
  if (!request.company.email) return;
  const supplier = (quote.supplier as { name: string } | null)?.name ?? '';
  await sendMail(newQuoteMail(request.company.language, request.company.email, supplier, request.title, `${appUrl()}/demande/${request.id}`)).catch(console.error);
}

/** What the PDF says about one line, beyond its price: stored with the offer's line. */
export function itemDetails(i: OfferReading['items'][number]) {
  return {
    offered: i.offered || null,
    mismatch: i.mismatch || null,
    package_size: i.package_size || null,
    package_price: i.package_price,
    packages: i.packages,
  };
}

/** Nodi reads the prices; the offer is submitted only when every item has one. */
async function applyReading(admin: SupabaseClient, quote: QuoteRow, request: RequestRow, bytes: Uint8Array): Promise<'attached' | 'submitted'> {
  const { data: items } = await admin.from('request_items').select('id, label, quantity, unit').eq('request_id', request.id).order('position');
  const requested = (items ?? []).map((i) => ({ id: i.id, label: i.label, quantity: Number(i.quantity), unit: i.unit }));
  const reading = await readOfferPdf(bytes, requested, new Date().toISOString().slice(0, 10));
  const prices = new Map((reading?.items ?? []).filter((i) => i.unit_price !== null).map((i) => [i.item_id, i.unit_price as number]));
  const details = new Map((reading?.items ?? []).map((i) => [i.item_id, itemDetails(i)]));
  const line = (itemId: string, unitPrice: number) => ({ quote_id: quote.id, item_id: itemId, unit_price: unitPrice, ...details.get(itemId) });
  const complete = quote.status === 'invited' && requested.length > 0 && requested.every((i) => prices.has(i.id));
  // What the supplier actually offers when it differs from the request (e.g. 12 buckets of 6 kg for 50 m²).
  const comment = quote.comment || reading?.note || null;
  if (reading) await admin.from('quotes').update({ checked_at: new Date().toISOString() }).eq('id', quote.id);

  if (complete) {
    // Not stated in the PDF stays unknown: never shown as free delivery.
    const deliveryFee = reading?.delivery_fee ?? null;
    await admin.from('quote_items').upsert(requested.map((i) => line(i.id, prices.get(i.id)!)));
    const total = offerTotalExVat(
      requested.map((i) => ({ quantity: i.quantity, unitPrice: prices.get(i.id)! })),
      deliveryFee ?? 0,
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
        comment,
      })
      .eq('id', quote.id)
      .eq('status', 'invited');
    await logEvent(admin, { kind: 'quote_submitted', company_id: quote.supplier_id, request_id: request.id, quote_id: quote.id, data: { total_ex_vat: total, via: 'email' } });
  } else if (quote.status === 'invited' && prices.size) {
    // Some lines only: the prices go into the comparison as "read from the PDF", the offer stays open.
    await admin.from('quote_items').upsert([...prices].map(([itemId, unitPrice]) => line(itemId, unitPrice)));
    await admin
      .from('quotes')
      .update({ delivery_fee: reading?.delivery_fee ?? null, lead_time_days: reading?.lead_time_days ?? null, valid_until: reading?.valid_until ?? null, comment })
      .eq('id', quote.id)
      .eq('status', 'invited');
  }
  return complete ? 'submitted' : 'attached';
}

/**
 * PDFs already on an offer that gave no price (read before Nodi understood other units,
 * or when the reading failed): read once more. offer_reads caps it.
 */
export async function rereadOffers(admin: SupabaseClient): Promise<number> {
  const { data: quotes } = await admin
    .from('quotes')
    .select(
      'id, status, supplier_id, offer_reads, comment, offer_file_path, supplier:companies(name), quote_items(item_id), request:price_requests!inner(id, title, status, company:companies(email, language))',
    )
    .eq('status', 'invited')
    .not('offer_file_path', 'is', null)
    .lt('offer_reads', 2)
    .eq('request.status', 'sent')
    .limit(10);
  let submitted = 0;
  for (const q of quotes ?? []) {
    if ((q.quote_items as unknown[]).length) continue;
    const { data: file } = await admin.storage.from('quote-files').download(q.offer_file_path as string);
    await admin
      .from('quotes')
      .update({ offer_reads: q.offer_reads + 1 })
      .eq('id', q.id);
    if (!file) continue;
    const request = q.request as unknown as RequestRow;
    const result = await applyReading(admin, q as unknown as QuoteRow, request, new Uint8Array(await file.arrayBuffer()));
    if (result === 'submitted') {
      submitted++;
      await tellContractor(q as unknown as QuoteRow, request);
    }
  }
  return submitted;
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
    const list = await brevo(`/inbound/events?sender=${encodeURIComponent(m.sender_email)}&startDate=${day(new Date(sent.getTime() - 86_400_000))}&endDate=${day(end)}&limit=50`);
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

/**
 * Offers with a PDF that Nodi has not compared with the request yet (typed in by the
 * supplier, or sent before the check existed): the material and sizes of each line
 * are checked and any difference is shown to the client. Prices are left as they are.
 */
export async function checkOffers(admin: SupabaseClient): Promise<number> {
  const { data: quotes } = await admin
    .from('quotes')
    .select('id, offer_file_path, quote_items(item_id), request:price_requests!inner(id, status)')
    .in('status', ['invited', 'submitted'])
    .not('offer_file_path', 'is', null)
    .is('checked_at', null)
    .eq('request.status', 'sent')
    .limit(5);
  let checked = 0;
  for (const q of quotes ?? []) {
    await admin.from('quotes').update({ checked_at: new Date().toISOString() }).eq('id', q.id);
    const lines = new Set((q.quote_items as { item_id: string }[]).map((i) => i.item_id));
    if (!lines.size) continue;
    const { data: file } = await admin.storage.from('quote-files').download(q.offer_file_path as string);
    if (!file) continue;
    const requestId = (q.request as unknown as { id: string }).id;
    const { data: items } = await admin.from('request_items').select('id, label, quantity, unit').eq('request_id', requestId).order('position');
    const requested = (items ?? []).map((i) => ({ id: i.id, label: i.label, quantity: Number(i.quantity), unit: i.unit }));
    const reading = await readOfferPdf(new Uint8Array(await file.arrayBuffer()), requested, new Date().toISOString().slice(0, 10));
    for (const i of reading?.items ?? []) {
      if (!lines.has(i.item_id)) continue;
      await admin.from('quote_items').update(itemDetails(i)).eq('quote_id', q.id).eq('item_id', i.item_id);
    }
    if (reading) checked++;
  }
  return checked;
}
