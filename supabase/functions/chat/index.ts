// Direct messages between two network companies (contractors and architects).
// POST { action: 'list' }                                  my conversations, newest first, with unread flags
// POST { action: 'thread', id }                            one conversation and its messages (marks it read)
// POST { action: 'start', company_id, body, opportunity_id? }  contact request with a first message
// POST { action: 'send', id, body }                        a message (one only while the request is pending)
// POST { action: 'answer', id, answer }                    accept | decline | block, by the company asked
// POST { action: 'deal', id, kind, amount?, note? }        confirm a deal; it counts once both sides confirm
// POST { action: 'undeal', id }                            withdraw my confirmation (up to 7 days after the deal)
// POST { action: 'report', id, reason? }                   report the conversation to the BatiNode team
// The other company never sees an e-mail address or phone number here, and the
// notification e-mails never contain the message itself.

import { notice, sendMail, type Lang } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { overLimit } from '../_shared/limits.ts';
import { adminClient, appUrl, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;
type Conversation = {
  id: string;
  company_a: string;
  company_b: string;
  started_by: string;
  opportunity_id: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  blocked_by: string | null;
  created_at: string;
  last_message_at: string;
  a_read_at: string | null;
  b_read_at: string | null;
  a_notified_at: string | null;
  b_notified_at: string | null;
  a_deal_at: string | null;
  b_deal_at: string | null;
  deal_kind: string | null;
  deal_amount_ex_vat: number | null;
  deal_note: string | null;
  deal_confirmed_at: string | null;
};

const COLUMNS =
  'id, company_a, company_b, started_by, opportunity_id, status, blocked_by, created_at, last_message_at, a_read_at, b_read_at, a_notified_at, b_notified_at, a_deal_at, b_deal_at, deal_kind, deal_amount_ex_vat, deal_note, deal_confirmed_at';
const DEAL_KINDS = ['subcontract', 'shared_site', 'equipment', 'other'];
const NETWORK_KINDS = ['contractor', 'architect'];
const UNDO_DAYS = 7;
const NOTIFY_EVERY_MINUTES = 15;

/** The caller's side of a conversation: 'a' or 'b'. */
const sideOf = (c: Conversation, me: string) => (c.company_a === me ? 'a' : 'b');
const otherOf = (c: Conversation, me: string) => (c.company_a === me ? c.company_b : c.company_a);

function cleanBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.replace(/\r\n/g, '\n').trim();
  return body.length >= 1 && body.length <= 4000 ? body : null;
}

/** The other company's view of the conversation: no e-mail, no phone. */
async function present(admin: Admin, me: string, list: Conversation[]) {
  const others = [...new Set(list.map((c) => otherOf(c, me)))];
  const { data: companies } = others.length
    ? await admin.from('companies').select('id, name, city, kind, logo_url, verification_status').in('id', others)
    : { data: [] };
  const byId = new Map((companies ?? []).map((c) => [c.id, c]));
  return list.map((c) => {
    const side = sideOf(c, me);
    const readAt = side === 'a' ? c.a_read_at : c.b_read_at;
    const other = byId.get(otherOf(c, me));
    return {
      id: c.id,
      status: c.status,
      mine: c.started_by === me,
      blockedByMe: c.blocked_by === me,
      opportunityId: c.opportunity_id,
      lastMessageAt: c.last_message_at,
      unread: !readAt || readAt < c.last_message_at,
      other: other
        ? { id: other.id, name: other.name, city: other.city, kind: other.kind, logoUrl: other.logo_url, verified: other.verification_status === 'verified' }
        : null,
      deal: {
        mine: Boolean(side === 'a' ? c.a_deal_at : c.b_deal_at),
        theirs: Boolean(side === 'a' ? c.b_deal_at : c.a_deal_at),
        confirmedAt: c.deal_confirmed_at,
        kind: c.deal_kind,
        amount: c.deal_amount_ex_vat === null ? null : Number(c.deal_amount_ex_vat),
        note: c.deal_note,
      },
    };
  });
}

/** E-mails the other company about a new message, at most every 15 minutes while unread. */
async function notify(admin: Admin, c: Conversation, me: string, fromName: string, isRequest: boolean) {
  const side = sideOf(c, me) === 'a' ? 'b' : 'a';
  const readAt = side === 'a' ? c.a_read_at : c.b_read_at;
  const notifiedAt = side === 'a' ? c.a_notified_at : c.b_notified_at;
  const recent = notifiedAt && Date.now() - new Date(notifiedAt).getTime() < NOTIFY_EVERY_MINUTES * 60_000;
  if (recent && (!readAt || readAt < notifiedAt!)) return;
  const { data: other } = await admin.from('companies').select('email, language').eq('id', otherOf(c, me)).single();
  if (!other?.email) return;
  const url = `${appUrl()}/discussion/${c.id}`;
  try {
    await sendMail(
      notice(other.language as Lang, other.email, {
        fr: isRequest
          ? {
              subject: `${fromName} souhaite entrer en contact avec vous`,
              paragraphs: [`${fromName} vous a envoyé une demande de contact sur BatiNode.`, 'Lisez son message et choisissez de l’accepter ou non dans l’app.'],
              cta: { label: 'Lire la demande', url },
            }
          : {
              subject: `Nouveau message de ${fromName}`,
              paragraphs: [`${fromName} vous a envoyé un message sur BatiNode.`],
              cta: { label: 'Lire le message', url },
            },
        nl: isRequest
          ? {
              subject: `${fromName} wil met u in contact komen`,
              paragraphs: [`${fromName} heeft u een contactverzoek gestuurd op BatiNode.`, 'Lees het bericht en kies in de app of u het aanvaardt.'],
              cta: { label: 'Verzoek lezen', url },
            }
          : {
              subject: `Nieuw bericht van ${fromName}`,
              paragraphs: [`${fromName} heeft u een bericht gestuurd op BatiNode.`],
              cta: { label: 'Bericht lezen', url },
            },
      }),
    );
    await admin
      .from('conversations')
      .update({ [`${side}_notified_at`]: new Date().toISOString() })
      .eq('id', c.id);
  } catch (e) {
    console.error(e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const me = await callerCompanyId(req, admin);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await admin.auth.getUser(jwt);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (action === 'list') {
    const { data } = await admin
      .from('conversations')
      .select(COLUMNS)
      .or(`company_a.eq.${me},company_b.eq.${me}`)
      .order('last_message_at', { ascending: false })
      .limit(200);
    // A declined or blocked request disappears for the one who refused it.
    const visible = ((data ?? []) as Conversation[]).filter((c) => !((c.status === 'declined' || c.status === 'blocked') && c.started_by !== me));
    return json({ conversations: await present(admin, me, visible) });
  }

  // Everything else is about one conversation the caller takes part in.
  const load = async (id: unknown) => {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const { data } = await admin.from('conversations').select(COLUMNS).eq('id', id).maybeSingle();
    const c = data as Conversation | null;
    return c && (c.company_a === me || c.company_b === me) ? c : null;
  };

  const { data: self } = await admin.from('companies').select('id, name, kind, verification_status').eq('id', me).single();
  const allowed = Boolean(self && NETWORK_KINDS.includes(self.kind) && self.verification_status !== 'rejected');

  if (action === 'thread') {
    const c = await load(body.id);
    if (!c) return json({ error: 'not_found' }, 404);
    const { data: messages } = await admin
      .from('conversation_messages')
      .select('id, author_company, body, created_at')
      .eq('conversation_id', c.id)
      .order('created_at')
      .limit(500);
    const now = new Date().toISOString();
    await admin.from('conversations').update({ [`${sideOf(c, me)}_read_at`]: now }).eq('id', c.id);
    const [view] = await present(admin, me, [{ ...c, [`${sideOf(c, me)}_read_at`]: now }]);
    return json({ conversation: view, messages: (messages ?? []).map((m) => ({ id: m.id, mine: m.author_company === me, body: m.body, createdAt: m.created_at })) });
  }

  if (!allowed) return json({ error: 'not_allowed' }, 403);

  if (action === 'start') {
    const other = body.company_id;
    const text = cleanBody(body.body);
    if (typeof other !== 'string' || other === me) return json({ error: 'not_found' }, 404);
    if (!text) return json({ error: 'invalid_body' }, 400);
    const { data: target } = await admin.from('companies').select('id, kind, verification_status').eq('id', other).maybeSingle();
    if (!target || !NETWORK_KINDS.includes(target.kind) || target.verification_status === 'rejected') return json({ error: 'not_found' }, 404);
    const [a, b] = [me, other].sort();
    const { data: existing } = await admin.from('conversations').select('id').eq('company_a', a).eq('company_b', b).maybeSingle();
    if (existing) return json({ id: existing.id, existing: true });
    // At most 10 new contact requests a day per company.
    if (await overLimit(admin, `chat-start:${me}`, 10, 86_400)) return json({ error: 'too_many' }, 429);
    let opportunityId: string | null = null;
    if (typeof body.opportunity_id === 'string') {
      const { data: post } = await admin.from('opportunities').select('id').eq('id', body.opportunity_id).maybeSingle();
      opportunityId = post?.id ?? null;
    }
    const { data: created, error } = await admin
      .from('conversations')
      .insert({ company_a: a, company_b: b, started_by: me, opportunity_id: opportunityId })
      .select(COLUMNS)
      .single();
    if (error || !created) return json({ error: 'save_failed' }, 500);
    await admin.from('conversation_messages').insert({ conversation_id: created.id, author_company: me, author_user: auth.user?.id ?? null, body: text });
    await admin.from('conversations').update({ [`${sideOf(created as Conversation, me)}_read_at`]: new Date().toISOString() }).eq('id', created.id);
    await notify(admin, created as Conversation, me, self!.name, true);
    await logEvent(admin, { kind: 'contact_requested', company_id: me, data: { with: other, from_post: Boolean(opportunityId) } });
    return json({ id: created.id });
  }

  const c = await load(body.id);
  if (!c) return json({ error: 'not_found' }, 404);
  const side = sideOf(c, me);

  if (action === 'send') {
    const text = cleanBody(body.body);
    if (!text) return json({ error: 'invalid_body' }, 400);
    if (c.status === 'blocked' || c.status === 'declined') return json({ error: 'closed' }, 409);
    if (c.status === 'pending') {
      // Until the other company accepts, the one asking cannot send more; the one asked accepts by replying.
      if (c.started_by === me) return json({ error: 'awaiting_answer' }, 409);
      await admin.from('conversations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', c.id);
    }
    if (await overLimit(admin, `chat-send:${me}`, 120, 3_600)) return json({ error: 'too_many' }, 429);
    const now = new Date().toISOString();
    const { error } = await admin.from('conversation_messages').insert({ conversation_id: c.id, author_company: me, author_user: auth.user?.id ?? null, body: text });
    if (error) return json({ error: 'save_failed' }, 500);
    await admin.from('conversations').update({ last_message_at: now, [`${side}_read_at`]: now }).eq('id', c.id);
    await notify(admin, { ...c, last_message_at: now }, me, self!.name, false);
    return json({ ok: true });
  }

  if (action === 'answer') {
    if (c.started_by === me || c.status !== 'pending') return json({ error: 'not_allowed' }, 409);
    const answer = body.answer;
    if (answer === 'accept') {
      await admin.from('conversations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', c.id);
      await logEvent(admin, { kind: 'contact_accepted', company_id: me, data: { with: otherOf(c, me) } });
    } else if (answer === 'decline' || answer === 'block') {
      await admin
        .from('conversations')
        .update({ status: answer === 'block' ? 'blocked' : 'declined', blocked_by: answer === 'block' ? me : null })
        .eq('id', c.id);
    } else return json({ error: 'invalid' }, 400);
    return json({ ok: true });
  }

  if (action === 'block') {
    await admin.from('conversations').update({ status: 'blocked', blocked_by: me }).eq('id', c.id);
    return json({ ok: true });
  }

  if (action === 'deal') {
    if (c.status !== 'accepted') return json({ error: 'not_allowed' }, 409);
    const kind = typeof body.kind === 'string' && DEAL_KINDS.includes(body.kind) ? body.kind : null;
    if (!kind) return json({ error: 'invalid_kind' }, 400);
    const amount = body.amount === null || body.amount === undefined || body.amount === '' ? null : Number(body.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000)) return json({ error: 'invalid_amount' }, 400);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    const now = new Date().toISOString();
    const theirs = side === 'a' ? c.b_deal_at : c.a_deal_at;
    await admin
      .from('conversations')
      .update({
        [`${side}_deal_at`]: now,
        deal_kind: kind,
        deal_amount_ex_vat: amount,
        deal_note: note,
        ...(theirs && !c.deal_confirmed_at ? { deal_confirmed_at: now } : {}),
      })
      .eq('id', c.id);
    if (theirs && !c.deal_confirmed_at) await logEvent(admin, { kind: 'network_deal', company_id: me, data: { with: otherOf(c, me), kind, amount } });
    return json({ ok: true, confirmed: Boolean(theirs) });
  }

  if (action === 'undeal') {
    if (c.deal_confirmed_at && Date.now() - new Date(c.deal_confirmed_at).getTime() > UNDO_DAYS * 86_400_000) return json({ error: 'too_late' }, 409);
    await admin.from('conversations').update({ [`${side}_deal_at`]: null, deal_confirmed_at: null }).eq('id', c.id);
    return json({ ok: true });
  }

  if (action === 'report') {
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) || null : null;
    const { count } = await admin.from('conversation_reports').select('id', { count: 'exact', head: true }).eq('conversation_id', c.id).eq('reporter', me);
    if (!count) await admin.from('conversation_reports').insert({ conversation_id: c.id, reporter: me, reason });
    await sendMail({
      to: Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be',
      subject: 'Conversation signalée sur le Réseau',
      text: `Une entreprise a signalé une conversation. Voir l'espace Admin : ${appUrl()}/admin`,
      html: `<p>Une entreprise a signalé une conversation.</p><p><a href="${appUrl()}/admin">Voir l'espace Admin</a></p>`,
    }).catch((e) => console.error(e));
    return json({ ok: true });
  }

  return json({ error: 'unknown_action' }, 400);
});
