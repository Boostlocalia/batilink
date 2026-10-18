// A signed-in supplier's space: its requests, orders and commission statements.
// GET  returns the dashboard.
// POST { open: 'quote' | 'order', id } returns a short-lived link to answer the
//      request or handle the order, on the same pages as the e-mailed links.

import { issueSupplierLink } from '../_shared/order-docs.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { hashToken, newToken } from '../_shared/tokens.ts';

const IN_APP_LINK_HOURS = 12;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  const companyId = await callerCompanyId(req, admin);
  if (!companyId) return json({ error: 'unauthorized' }, 401);
  const { data: me } = await admin.from('companies').select('id, kind, commission_rate').eq('id', companyId).single();
  if (me?.kind !== 'supplier') return json({ error: 'not_a_supplier' }, 403);

  if (req.method === 'GET') {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const [{ data: quotes }, { data: orders }, { data: bills }, { data: pending }] = await Promise.all([
      admin
        .from('quotes')
        .select('id, status, total_ex_vat, submitted_at, created_at, request:price_requests(title, city, postal_code, reply_by, needed_by, status, company:companies(name, verification_status))')
        .eq('supplier_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('purchase_orders')
        .select('id, number, title, status, total_ex_vat, created_at, contractor:companies!purchase_orders_contractor_id_fkey(name)')
        .eq('supplier_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('commission_bills')
        .select('id, number, month, amount_ex_vat, amount_inc_vat, status, created_at, paid_at')
        .eq('supplier_id', companyId)
        .order('month', { ascending: false })
        .limit(24),
      admin.from('commissions').select('amount_ex_vat, base_ex_vat').eq('supplier_id', companyId).eq('status', 'pending').gte('awarded_at', monthStart),
    ]);
    const recent = (quotes ?? []).filter((q) => q.created_at >= since);
    const answered = recent.filter((q) => q.status !== 'invited').length;
    const won = recent.filter((q) => q.status === 'awarded');
    return json({
      commission_rate: Number(me.commission_rate),
      quotes,
      orders,
      bills,
      this_month: {
        sales_ex_vat: (pending ?? []).reduce((s, c) => s + Number(c.base_ex_vat), 0),
        commission_ex_vat: (pending ?? []).reduce((s, c) => s + Number(c.amount_ex_vat), 0),
      },
      stats: {
        invited: recent.length,
        answered,
        won: won.length,
        won_ex_vat: won.reduce((s, q) => s + Number(q.total_ex_vat ?? 0), 0),
      },
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const body = (await req.json().catch(() => ({}))) as { open?: string; id?: string };
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id)) return json({ error: 'not_found' }, 404);

  if (body.open === 'quote') {
    const { data: quote } = await admin.from('quotes').select('id, supplier_id').eq('id', body.id).maybeSingle();
    if (!quote || quote.supplier_id !== companyId) return json({ error: 'not_found' }, 404);
    const token = newToken();
    await admin.from('quote_links').insert({
      token_hash: await hashToken(token),
      quote_id: quote.id,
      expires_at: new Date(Date.now() + IN_APP_LINK_HOURS * 3_600_000).toISOString(),
    });
    return json({ url: `${appUrl()}/offre/${token}`, path: `/offre/${token}` });
  }

  if (body.open === 'order') {
    const { data: order } = await admin.from('purchase_orders').select('id, supplier_id').eq('id', body.id).maybeSingle();
    if (!order || order.supplier_id !== companyId) return json({ error: 'not_found' }, 404);
    const url = await issueSupplierLink(admin, order.id);
    return json({ url, path: new URL(url).pathname });
  }

  return json({ error: 'unknown_action' }, 400);
});
