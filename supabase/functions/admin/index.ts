// The platform team's space: key figures, requests waiting for quotes, suppliers to
// complete or add, companies to verify. Only accounts listed in platform_admins.
// POST { action: 'overview' }
// POST { action: 'suppliers', q? }                        search suppliers
// POST { action: 'supplier', id }                         one supplier with its coverage
// POST { action: 'save_supplier', supplier }              add (no id) or edit a supplier
// POST { action: 'verify', company_id, status }           verified | rejected | needs_review
// POST { action: 'invite_to_request', request_id, supplier_id }  add a supplier to a sent request
// POST { action: 'auto_complete', request_id }            let BatiNode pick suppliers again for a request
// POST { action: 'report_handled', id }                   mark a reported conversation as dealt with
// POST { action: 'news' }                                 the carousel's news of the last 14 days, hidden ones too
// POST { action: 'news_hide', id, hidden }                hide or show one news item

import { AUTO_SUPPLIERS, inviteSuppliers, pickSuppliers, type SentRequest } from '../_shared/invitations.ts';
import { adminClient, corsHeaders, json } from '../_shared/supabase.ts';

// Same provinces as public.region_prefixes().
const REGION_PREFIXES: Record<string, string[]> = {
  BRU: ['10', '11', '12'],
  BW: ['13', '14'],
  VB: ['15', '16', '17', '18', '19', '30', '31', '32', '33', '34'],
  ANT: ['2'],
  LIM: ['35', '36', '37', '38', '39'],
  LIE: ['4'],
  NAM: ['5'],
  HAI: ['60', '61', '62', '63', '64', '65', '7'],
  LUX: ['66', '67', '68', '69'],
  WVL: ['8'],
  OVL: ['9'],
};

const SUPPLIER_FIELDS = 'id, name, vat_number, email, quote_email, phone, contact_name, street, postal_code, city, language, regions, verification_status, requests_stopped_at, created_at';

type SupplierInput = {
  id?: string;
  name?: string;
  vat_number?: string;
  email?: string;
  quote_email?: string;
  phone?: string;
  contact_name?: string;
  street?: string;
  postal_code?: string;
  city?: string;
  language?: string;
  categories?: number[];
  regions?: string[];
};

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, max);
  return v || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!auth.user) return json({ error: 'unauthorized' }, 401);
  const { data: allowed } = await admin.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!allowed) return json({ error: 'forbidden' }, 403);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    q?: string;
    id?: string;
    supplier?: SupplierInput;
    company_id?: string;
    status?: string;
    request_id?: string;
    supplier_id?: string;
    hidden?: boolean;
  };

  if (body.action === 'overview') {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    const companies = () => admin.from('companies').select('id', { count: 'exact', head: true });
    const [contractors, suppliers, architects, newWeek, toVerify, waiting, quotesWeek, ordersWeek, plans, open, review, incomplete, recent] = await Promise.all([
      count(companies().eq('kind', 'contractor')),
      count(companies().eq('kind', 'supplier')),
      count(companies().eq('kind', 'architect')),
      count(companies().gte('created_at', weekAgo)),
      count(companies().in('verification_status', ['pending', 'needs_review']).neq('kind', 'supplier')),
      count(admin.from('price_requests').select('id', { count: 'exact', head: true }).eq('status', 'sent')),
      count(admin.from('quotes').select('id', { count: 'exact', head: true }).gte('submitted_at', weekAgo)),
      count(admin.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'awarded').gte('submitted_at', weekAgo)),
      admin.from('subscriptions').select('plan, status, trial_ends_at'),
      admin
        .from('price_requests')
        .select('id, title, city, postal_code, reply_by, sent_at, supplier_choice, company:companies(name), quotes(status)')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(30),
      admin
        .from('companies')
        .select('id, kind, name, vat_number, city, created_at, verification_status')
        .in('verification_status', ['pending', 'needs_review'])
        .neq('kind', 'supplier')
        .order('created_at', { ascending: false })
        .limit(30),
      admin
        .from('companies')
        .select('id, name, city, phone, created_at, fans:preferred_suppliers!preferred_suppliers_supplier_id_fkey(contractor:companies!preferred_suppliers_contractor_id_fkey(name))')
        .eq('kind', 'supplier')
        .is('email', null)
        .is('quote_email', null)
        .order('created_at', { ascending: false })
        .limit(30),
      admin.from('companies').select('id, kind, name, city, created_at').order('created_at', { ascending: false }).limit(10),
    ]);

    // Network contacts: requests, accepted, active in 30 days, deals both sides confirmed.
    // The team sees figures, companies and deal types, never the messages.
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const conv = () => admin.from('conversations').select('id', { count: 'exact', head: true });
    const [requested, accepted, active, deals, dealRows, reports] = await Promise.all([
      count(conv()),
      count(conv().not('accepted_at', 'is', null)),
      count(conv().eq('status', 'accepted').gte('last_message_at', monthAgo)),
      count(conv().not('deal_confirmed_at', 'is', null)),
      admin
        .from('conversations')
        .select('id, deal_kind, deal_amount_ex_vat, deal_confirmed_at, a:companies!conversations_company_a_fkey(name), b:companies!conversations_company_b_fkey(name)')
        .not('deal_confirmed_at', 'is', null)
        .order('deal_confirmed_at', { ascending: false })
        .limit(50),
      admin
        .from('conversation_reports')
        .select('id, reason, created_at, reporter:companies(name), conversation:conversations(a:companies!conversations_company_a_fkey(name), b:companies!conversations_company_b_fkey(name))')
        .is('handled_at', null)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    const name = (x: unknown) => (x as { name?: string } | null)?.name ?? '';
    const contacts = {
      requested,
      accepted,
      active,
      deals,
      conversion: accepted ? Math.round((deals / accepted) * 100) : 0,
      amount: (dealRows.data ?? []).reduce((sum, d) => sum + Number(d.deal_amount_ex_vat ?? 0), 0),
      recentDeals: (dealRows.data ?? []).map((d) => ({ id: d.id, kind: d.deal_kind, amount: d.deal_amount_ex_vat === null ? null : Number(d.deal_amount_ex_vat), at: d.deal_confirmed_at, between: [name(d.a), name(d.b)] })),
      reports: (reports.data ?? []).map((r) => {
        const c = r.conversation as unknown as { a: unknown; b: unknown } | null;
        return { id: r.id, reason: r.reason, at: r.created_at, reporter: name(r.reporter), between: c ? [name(c.a), name(c.b)] : [] };
      }),
    };

    const byPlan: Record<string, number> = {};
    let trials = 0;
    for (const s of plans.data ?? []) {
      if (s.status !== 'active') continue;
      byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
      if (s.trial_ends_at && s.trial_ends_at > new Date().toISOString()) trials++;
    }

    return json({
      figures: { contractors, suppliers, architects, newWeek, toVerify, waiting, quotesWeek, ordersWeek, byPlan, trials },
      waiting: (open.data ?? []).map((r) => {
        const quotes = (r.quotes ?? []) as { status: string }[];
        return {
          id: r.id,
          title: r.title,
          place: [r.postal_code, r.city].filter(Boolean).join(' '),
          reply_by: r.reply_by,
          sent_at: r.sent_at,
          batinode: r.supplier_choice !== 'own',
          target: r.supplier_choice !== 'own' ? AUTO_SUPPLIERS : null,
          company: (r.company as { name?: string } | null)?.name ?? null,
          invited: quotes.length,
          answered: quotes.filter((q) => q.status === 'submitted' || q.status === 'awarded' || q.status === 'not_selected').length,
        };
      }),
      toVerify: review.data ?? [],
      incomplete: (incomplete.data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        phone: s.phone,
        created_at: s.created_at,
        added_by: ((s.fans ?? []) as { contractor?: { name?: string } | null }[]).map((f) => f.contractor?.name).filter(Boolean),
      })),
      recent: recent.data ?? [],
      contacts,
    });
  }

  if (body.action === 'suppliers') {
    let query = admin.from('companies').select(SUPPLIER_FIELDS).eq('kind', 'supplier').order('name').limit(50);
    const q = text(body.q, 80)?.replace(/[%,()]/g, ' ');
    if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,email.ilike.%${q}%,postal_code.ilike.${q}%`);
    const { data } = await query;
    return json({ suppliers: data ?? [] });
  }

  if (body.action === 'supplier') {
    if (typeof body.id !== 'string') return json({ error: 'not_found' }, 404);
    const [{ data: supplier }, { data: coverage }] = await Promise.all([
      admin.from('companies').select(SUPPLIER_FIELDS).eq('id', body.id).eq('kind', 'supplier').maybeSingle(),
      admin.from('supplier_coverage').select('category_id').eq('supplier_id', body.id),
    ]);
    if (!supplier) return json({ error: 'not_found' }, 404);
    return json({ supplier: { ...supplier, categories: [...new Set((coverage ?? []).map((c) => c.category_id))] } });
  }

  if (body.action === 'save_supplier') {
    const s = body.supplier ?? {};
    const name = text(s.name, 120);
    if (!name || name.length < 2) return json({ error: 'invalid_name' }, 400);
    const vat = text(s.vat_number, 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? null;
    if (vat && !/^BE[01][0-9]{9}$/.test(vat)) return json({ error: 'invalid_vat' }, 400);
    const email = text(s.email, 200)?.toLowerCase() ?? null;
    const quoteEmail = text(s.quote_email, 200)?.toLowerCase() ?? null;
    for (const e of [email, quoteEmail]) if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return json({ error: 'invalid_email' }, 400);
    const phone = text(s.phone, 20);
    if (phone && !/^\+?[0-9 ./-]{8,20}$/.test(phone)) return json({ error: 'invalid_phone' }, 400);
    const postal = text(s.postal_code, 4);
    if (postal && !/^[1-9][0-9]{3}$/.test(postal)) return json({ error: 'invalid_postal_code' }, 400);
    const regions = (Array.isArray(s.regions) ? s.regions : []).filter((r) => r in REGION_PREFIXES);
    const categories = (Array.isArray(s.categories) ? s.categories : []).filter((c) => Number.isInteger(c));

    const row = {
      name,
      vat_number: vat,
      email,
      quote_email: quoteEmail,
      phone,
      contact_name: text(s.contact_name, 120),
      street: text(s.street, 200),
      postal_code: postal,
      city: text(s.city, 80),
      language: s.language === 'nl' ? 'nl' : 'fr',
      regions,
    };

    let id = typeof s.id === 'string' ? s.id : null;
    if (id) {
      const { data: found } = await admin.from('companies').select('id').eq('id', id).eq('kind', 'supplier').maybeSingle();
      if (!found) return json({ error: 'not_found' }, 404);
      const { error } = await admin.from('companies').update(row).eq('id', id);
      if (error) return json({ error: error.code === '23505' ? 'vat_taken' : 'save_failed', detail: error.message }, 400);
    } else {
      const { data: created, error } = await admin.from('companies').insert({ ...row, kind: 'supplier' }).select('id').single();
      if (error || !created) return json({ error: error?.code === '23505' ? 'vat_taken' : 'save_failed', detail: error?.message }, 400);
      id = created.id as string;
    }

    // Coverage: every category in every postal prefix of the chosen provinces.
    const { data: known } = await admin.from('categories').select('id').in('id', categories.length ? categories : [-1]);
    const rows = (known ?? []).flatMap((c) =>
      regions.flatMap((r) => REGION_PREFIXES[r].map((prefix) => ({ supplier_id: id, category_id: c.id, postal_prefix: prefix }))),
    );
    await admin.from('supplier_coverage').delete().eq('supplier_id', id);
    if (rows.length) {
      const { error } = await admin.from('supplier_coverage').insert(rows);
      if (error) return json({ error: 'coverage_failed', detail: error.message, id }, 500);
    }
    return json({ ok: true, id });
  }

  if (body.action === 'verify') {
    const status = body.status;
    if (typeof body.company_id !== 'string' || !['verified', 'rejected', 'needs_review'].includes(status ?? '')) {
      return json({ error: 'invalid' }, 400);
    }
    const now = new Date().toISOString();
    const { error } = await admin
      .from('companies')
      .update({ verification_status: status, verified_at: status === 'verified' ? now : null, last_checked_at: now })
      .eq('id', body.company_id);
    if (error) return json({ error: 'save_failed', detail: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'news') {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await admin
      .from('news_items')
      .select('id, published_on, topic, title_fr, text_fr, source_name, source_url, hidden')
      .gte('published_on', since)
      .order('published_on', { ascending: false })
      .order('created_at', { ascending: true });
    return json({ news: data ?? [] });
  }

  if (body.action === 'news_hide') {
    if (typeof body.id !== 'string') return json({ error: 'not_found' }, 404);
    await admin.from('news_items').update({ hidden: body.hidden === true }).eq('id', body.id);
    return json({ ok: true });
  }

  if (body.action === 'report_handled') {
    if (typeof body.id !== 'string') return json({ error: 'not_found' }, 404);
    await admin.from('conversation_reports').update({ handled_at: new Date().toISOString() }).eq('id', body.id);
    return json({ ok: true });
  }

  if (body.action === 'invite_to_request' || body.action === 'auto_complete') {
    if (typeof body.request_id !== 'string') return json({ error: 'not_found' }, 404);
    const { data: request } = await admin
      .from('price_requests')
      .select('id, company_id, title, category_id, postal_code, city, needed_by, reply_by, fulfilment, status')
      .eq('id', body.request_id)
      .maybeSingle();
    if (!request || request.status !== 'sent') return json({ error: 'not_open' }, 409);
    let ids: string[];
    if (body.action === 'auto_complete') {
      const { count } = await admin.from('quotes').select('id', { count: 'exact', head: true }).eq('request_id', request.id);
      ids = await pickSuppliers(admin, request as SentRequest, Math.max(0, AUTO_SUPPLIERS - (count ?? 0)));
      if (!ids.length) return json({ error: 'none_found' }, 404);
    } else {
      if (typeof body.supplier_id !== 'string') return json({ error: 'not_found' }, 404);
      const [{ data: supplier }, { data: existing }] = await Promise.all([
        admin.from('companies').select('id, email, quote_email, requests_stopped_at').eq('id', body.supplier_id).eq('kind', 'supplier').maybeSingle(),
        admin.from('quotes').select('id').eq('request_id', request.id).eq('supplier_id', body.supplier_id).maybeSingle(),
      ]);
      if (!supplier) return json({ error: 'not_found' }, 404);
      if (existing) return json({ error: 'already_invited' }, 409);
      if (supplier.requests_stopped_at) return json({ error: 'unsubscribed' }, 409);
      if (!(supplier.quote_email ?? supplier.email)) return json({ error: 'no_email' }, 400);
      ids = [supplier.id];
    }
    const result = await inviteSuppliers(admin, request as SentRequest, ids);
    if (!result.sent.length) return json({ error: 'send_failed' }, 500);
    return json({ ok: true, sent: result.sent.length });
  }

  return json({ error: 'unknown_action' }, 400);
});
