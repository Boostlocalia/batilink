// Public endpoint behind the order link e-mailed to the supplier (no account, no JWT).
// GET  ?token=…  returns the order, its lines, the contractor and the proofs sent
//                (deposit, delivery note, payment). The contractor pays the supplier directly.
// POST { token, action, … } with action:
//   confirm           { deposit_inc_vat, iban?, in_stock, store_address? }
//                     confirms the order, optionally asking a deposit; says where the client finds
//                     the goods and whether everything is in stock
//   decline           { reason? }                 cannot deliver: the order and commission are cancelled
//   deposit_received                              the deposit arrived: the order starts
//   deposit_rejected  { reason }                  the deposit did not arrive
//   ready             { note? }                   goods that were not in stock have arrived

import { depositAnsweredMail, orderConfirmedMail, orderDeclinedMail, orderReadyMail, sendMail, type Lang, type StoreInfo } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { contractorOrderUrl, documentLink, orderIdFromLink } from '../_shared/order-docs.ts';
import { canDo, normalizeIban, statusAfterConfirm, type OrderStatus } from '../_shared/orders.ts';
import { adminClient, corsHeaders, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

const ORDER_COLUMNS =
  'id, number, quote_id, request_id, contractor_id, supplier_id, title, total_ex_vat, vat, total_inc_vat, status, supplier_confirmed_at, deposit_inc_vat, supplier_iban, deposit_proof_sent_at, deposit_received_at, deposit_rejected_reason, delivered_at, payment_reported_at, cancelled_at, created_at, store_address, in_stock, ready_at';

async function findOrder(admin: Admin, token: unknown) {
  const orderId = await orderIdFromLink(admin, token);
  if (!orderId) return null;
  const { data } = await admin.from('purchase_orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
  return data;
}

type Order = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

/** Moves the order only if nobody changed it meanwhile. */
async function move(admin: Admin, order: Order, patch: Record<string, unknown>) {
  const { data } = await admin
    .from('purchase_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', order.status)
    .select('id');
  return Boolean(data?.length);
}

function companyAddress(c: { street: string | null; postal_code: string | null; city: string | null }): string | null {
  const place = [c.postal_code, c.city].filter(Boolean).join(' ');
  return [c.street, place].filter(Boolean).join(', ') || null;
}

/** Where the client finds the goods: the address the supplier gave, else its company address. */
async function storeOf(admin: Admin, order: Order, storeAddress: string | null): Promise<StoreInfo> {
  const [{ data: c }, { data: r }] = await Promise.all([
    admin.from('companies').select('street, postal_code, city, phone').eq('id', order.supplier_id).single(),
    admin.from('price_requests').select('fulfilment').eq('id', order.request_id).single(),
  ]);
  return { address: storeAddress || (c ? companyAddress(c) : null), phone: c?.phone || null, pickup: r?.fulfilment === 'pickup' };
}

async function contractorOf(admin: Admin, order: Order) {
  const { data } = await admin.from('companies').select('name, email, language').eq('id', order.contractor_id).single();
  return data as { name: string; email: string | null; language: Lang } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token');
    const order = await findOrder(admin, token);
    if (!order) return json({ error: 'invalid_link' }, 404);
    const [{ data: request }, { data: items }, { data: prices }, { data: supplier }, contractor, { data: docs }] = await Promise.all([
      admin.from('price_requests').select('postal_code, city, needed_by, fulfilment, note').eq('id', order.request_id).single(),
      admin.from('request_items').select('id, label, quantity, unit').eq('request_id', order.request_id).order('position'),
      admin.from('quote_items').select('item_id, unit_price').eq('quote_id', order.quote_id),
      admin.from('companies').select('name, language, street, postal_code, city').eq('id', order.supplier_id).single(),
      contractorOf(admin, order),
      admin
        .from('order_documents')
        .select('id, kind, file_name, content_type, storage_path, created_at')
        .eq('order_id', order.id)
        .in('kind', ['deposit_proof', 'delivery_note', 'payment_proof'])
        .order('created_at'),
    ]);
    const documents = await Promise.all(
      (docs ?? []).map(async (d) => ({
        id: d.id,
        kind: d.kind,
        file_name: d.file_name,
        content_type: d.content_type,
        created_at: d.created_at,
        url: await documentLink(admin, d.storage_path),
      })),
    );
    return json({
      order,
      request,
      items: (items ?? []).map((i) => ({ ...i, unit_price: Number(prices?.find((p) => p.item_id === i.id)?.unit_price ?? 0) })),
      supplier: supplier && { name: supplier.name, language: supplier.language, address: companyAddress(supplier) },
      // The supplier needs to reach the contractor to deliver: the order is the agreement.
      contractor: contractor && { name: contractor.name, email: contractor.email },
      documents,
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const order = await findOrder(admin, body.token);
  if (!order) return json({ error: 'invalid_link' }, 404);
  const status = order.status as OrderStatus;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const contractor = await contractorOf(admin, order);
  const { data: supplierName } = await admin.from('companies').select('name').eq('id', order.supplier_id).single();
  const mailData = contractor?.email
    ? { lang: contractor.language, to: contractor.email, number: order.number, title: order.title, other: supplierName?.name ?? '', url: contractorOrderUrl(order.id) }
    : null;

  if (body.action === 'confirm') {
    if (!canDo('supplier_confirm', status)) return json({ error: 'wrong_step' }, 409);
    const deposit = Math.round(Number(body.deposit_inc_vat ?? 0) * 100) / 100;
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > Number(order.total_inc_vat)) return json({ error: 'invalid_deposit' }, 400);
    let iban: string | null = null;
    if (typeof body.iban === 'string' && body.iban.trim()) {
      iban = normalizeIban(body.iban);
      if (!iban) return json({ error: 'invalid_iban' }, 400);
    }
    if (typeof body.in_stock !== 'boolean') return json({ error: 'stock_required' }, 400);
    const inStock = body.in_stock;
    const storeAddress = typeof body.store_address === 'string' ? body.store_address.trim().replace(/\s+/g, ' ').slice(0, 300) || null : null;
    const next = statusAfterConfirm(deposit);
    const now = new Date().toISOString();
    const ok = await move(admin, order, {
      status: next,
      supplier_confirmed_at: now,
      deposit_inc_vat: deposit,
      supplier_iban: iban,
      store_address: storeAddress,
      in_stock: inStock,
      ready_at: inStock ? now : null,
    });
    if (!ok) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, {
      kind: 'order_confirmed',
      company_id: order.supplier_id,
      request_id: order.request_id,
      quote_id: order.quote_id,
      data: { order: order.number, deposit, in_stock: inStock },
    });
    if (mailData) {
      const store = await storeOf(admin, order, storeAddress);
      await sendMail(orderConfirmedMail(mailData, deposit > 0 ? { amount: deposit, iban } : null, { ...store, inStock })).catch(console.error);
    }
    return json({ ok: true, status: next });
  }

  if (body.action === 'decline') {
    if (!canDo('supplier_decline', status)) return json({ error: 'wrong_step' }, 409);
    const ok = await move(admin, order, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason || 'supplier_declined' });
    if (!ok) return json({ error: 'wrong_step' }, 409);
    // No sale, no commission.
    await admin.from('commissions').update({ status: 'cancelled' }).eq('order_id', order.id).eq('status', 'pending');
    await logEvent(admin, { kind: 'order_declined', company_id: order.supplier_id, request_id: order.request_id, quote_id: order.quote_id, data: { order: order.number, reason } });
    if (mailData) await sendMail(orderDeclinedMail(mailData, reason || null)).catch(console.error);
    return json({ ok: true, status: 'cancelled' });
  }

  if (body.action === 'deposit_received') {
    if (!canDo('deposit_received', status)) return json({ error: 'wrong_step' }, 409);
    const ok = await move(admin, order, {
      status: 'in_progress',
      deposit_received_at: new Date().toISOString(),
      deposit_rejected_reason: null,
    });
    if (!ok) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, { kind: 'deposit_received', company_id: order.supplier_id, quote_id: order.quote_id, data: { order: order.number } });
    if (mailData) await sendMail(depositAnsweredMail(mailData, true)).catch(console.error);
    return json({ ok: true, status: 'in_progress' });
  }

  if (body.action === 'deposit_rejected') {
    if (!canDo('deposit_rejected', status)) return json({ error: 'wrong_step' }, 409);
    if (!reason) return json({ error: 'reason_required' }, 400);
    const ok = await move(admin, order, { status: 'awaiting_deposit', deposit_rejected_reason: reason });
    if (!ok) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, { kind: 'deposit_rejected', company_id: order.supplier_id, quote_id: order.quote_id, data: { order: order.number, reason } });
    if (mailData) await sendMail(depositAnsweredMail(mailData, false, reason)).catch(console.error);
    return json({ ok: true, status: 'awaiting_deposit' });
  }

  if (body.action === 'ready') {
    if (!canDo('supplier_ready', status) || order.ready_at) return json({ error: 'wrong_step' }, 409);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    const { data: moved } = await admin
      .from('purchase_orders')
      .update({ ready_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', order.status)
      .is('ready_at', null)
      .select('id');
    if (!moved?.length) return json({ error: 'wrong_step' }, 409);
    await logEvent(admin, { kind: 'order_ready', company_id: order.supplier_id, request_id: order.request_id, quote_id: order.quote_id, data: { order: order.number } });
    if (mailData) await sendMail(orderReadyMail(mailData, await storeOf(admin, order, order.store_address), note)).catch(console.error);
    return json({ ok: true, status });
  }

  return json({ error: 'unknown_action' }, 400);
});
