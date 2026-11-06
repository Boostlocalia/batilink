// Hourly (x-cron-secret): checks the limits of the services BatiNode runs on (Brevo
// e-mails, Supabase database, files and accounts, the Claude API, scheduled jobs)
// and e-mails the team at 70 % and 90 % of a limit, once a day per service and level.

import { isCron } from '../_shared/cron.ts';
import { sendMail } from '../_shared/email.ts';
import { logEvent } from '../_shared/events.ts';
import { fmtMb, levelOf, planLimits, type Level, type Usage } from '../_shared/quotas.ts';
import { adminClient, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;

/** E-mails Brevo accepted today (UTC), from its aggregated statistics. */
async function emailsToday(): Promise<number | null> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return null;
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${today}&endDate=${today}`, {
    headers: { 'api-key': apiKey, Accept: 'application/json' },
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { requests?: number };
  return typeof body.requests === 'number' ? body.requests : null;
}

/** A one-token call: fails when the Claude API credit is used up or the key is refused. */
async function aiAnswers(): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
  if (res.ok) return null;
  return `${res.status} ${(await res.text()).slice(0, 200)}`;
}

/** True the first time this service reaches this level today. */
async function firstToday(admin: Admin, service: string, level: Level): Promise<boolean> {
  const since = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { count } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'quota_alert')
    .gte('occurred_at', since)
    .contains('data', { service, level });
  return !count;
}

Deno.serve(async (req) => {
  const admin = adminClient();
  if (!(await isCron(req, admin))) return json({ error: 'unauthorized' }, 401);
  const limits = planLimits((k) => Deno.env.get(k));
  // The slower checks once a day, early morning in Brussels; e-mails every hour.
  const full = new Date().getUTCHours() === 5;

  const usages: Usage[] = [];
  const sent = await emailsToday();
  if (sent !== null) {
    usages.push({
      service: 'emails',
      used: sent,
      limit: limits.emailsPerDay,
      note: `${sent} e-mails envoyés aujourd'hui sur ${limits.emailsPerDay} permis par Brevo. Au-delà, plus aucun e-mail ne part jusqu'à demain : passez à un plan Brevo payant (app.brevo.com → Mon plan).`,
    });
  }

  if (full) {
    const { data } = await admin.rpc('ops_usage');
    const u = (data ?? {}) as { db_bytes?: number; storage_bytes?: number; users?: number; jobs_failed?: number; jobs_http_errors?: number };
    usages.push(
      {
        service: 'database',
        used: u.db_bytes ?? 0,
        limit: limits.dbBytes,
        note: `Base de données : ${fmtMb(u.db_bytes ?? 0)} sur ${fmtMb(limits.dbBytes)}. Passez au plan Supabase supérieur (supabase.com → Billing).`,
      },
      {
        service: 'files',
        used: u.storage_bytes ?? 0,
        limit: limits.storageBytes,
        note: `Fichiers (PDF, logos) : ${fmtMb(u.storage_bytes ?? 0)} sur ${fmtMb(limits.storageBytes)}. Passez au plan Supabase supérieur (supabase.com → Billing).`,
      },
      {
        service: 'accounts',
        used: u.users ?? 0,
        limit: limits.users,
        note: `${u.users ?? 0} comptes sur ${limits.users} permis par Supabase.`,
      },
    );
    const jobErrors = (u.jobs_failed ?? 0) + (u.jobs_http_errors ?? 0);
    // Any failed run of a scheduled job (reminders, checks, news) is worth a look.
    usages.push({ service: 'jobs', used: jobErrors ? 1 : 0, limit: 1, note: `${jobErrors} exécution(s) de tâches automatiques en erreur ces dernières 24 h (relances, vérifications, actualités).` });

    const ai = await aiAnswers();
    usages.push({
      service: 'ai',
      used: ai ? 1 : 0,
      limit: 1,
      note: `L'IA (Nodi, traductions, lecture des PDF) ne répond plus : ${ai ?? ''}. Vérifiez le crédit sur console.anthropic.com → Billing.`,
    });
  }

  const alerts: { service: string; level: Level; note: string }[] = [];
  for (const u of usages) {
    const level = levelOf(u);
    if (level === 'ok' || !(await firstToday(admin, u.service, level))) continue;
    alerts.push({ service: u.service, level, note: u.note });
    await logEvent(admin, { kind: 'quota_alert', data: { service: u.service, level, used: u.used, limit: u.limit } });
  }

  if (alerts.length) {
    const to = Deno.env.get('ALERT_EMAIL') ?? Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be';
    const lines = alerts.map((a) => `${a.level === 'critical' ? '🔴' : '🟠'} ${a.note}`);
    await sendMail({
      to,
      subject: `BatiNode : ${alerts.some((a) => a.level === 'critical') ? 'limite presque atteinte' : 'limite à surveiller'}`,
      html: lines.map((l) => `<p>${l.replace(/[<>&]/g, '')}</p>`).join(''),
      text: lines.join('\n\n'),
    }).catch(console.error);
  }
  return json({ checked: usages.map((u) => ({ service: u.service, used: u.used, limit: u.limit, level: levelOf(u) })), alerts: alerts.length });
});
