// Daily job (x-cron-secret): ends Premium trials, sends activation and retention
// e-mails, and grants referral rewards once the referred company is verified.
// Each e-mail goes once per company (lifecycle_messages), so reruns are safe.

import { isCron } from '../_shared/cron.ts';
import { sendMail, type Lang } from '../_shared/email.ts';
import {
  activationMail,
  newcomersMail,
  referralRewardMail,
  trialEndedMail,
  trialEndingMail,
  winbackMail,
  type Kind,
} from '../_shared/growth-mail.ts';
import { logEvent } from '../_shared/events.ts';
import { PLANS, TRIAL_PLAN } from '../_shared/plans.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;
const DAY = 86_400_000;
/** A referral is worth one month of Starter. */
const REWARD_EX_VAT = PLANS.pro.priceExVat;
const REWARD_LABEL = REWARD_EX_VAT.toFixed(2).replace('.', ',');
const REWARD_DAYS = 30;

/** Records the message; false when it was already sent. */
async function once(admin: Admin, companyId: string, kind: string): Promise<boolean> {
  const { error } = await admin.from('lifecycle_messages').insert({ company_id: companyId, kind });
  return !error;
}

async function endTrials(admin: Admin, now: Date) {
  let ending = 0;
  let ended = 0;
  const { data: subs } = await admin
    .from('subscriptions')
    .select('company_id, trial_ends_at, company:companies(email, language)')
    .eq('plan', TRIAL_PLAN)
    .is('provider_subscription_id', null)
    .not('trial_ends_at', 'is', null)
    .lt('trial_ends_at', new Date(now.getTime() + 3 * DAY).toISOString());
  for (const s of subs ?? []) {
    const company = s.company as unknown as { email: string | null; language: Lang } | null;
    const end = new Date(s.trial_ends_at!);
    if (end <= now) {
      await admin.from('subscriptions').update({ plan: 'free', updated_at: now.toISOString() }).eq('company_id', s.company_id).eq('plan', TRIAL_PLAN).is('provider_subscription_id', null);
      await logEvent(admin, { kind: 'subscription_changed', company_id: s.company_id, data: { plan: 'free', reason: 'trial_ended' } });
      if (company?.email && (await once(admin, s.company_id, `trial_ended:${s.trial_ends_at}`))) {
        await sendMail(trialEndedMail(company.language, company.email, `${appUrl()}/abonnement`)).catch(console.error);
      }
      ended++;
    } else if (company?.email && (await once(admin, s.company_id, `trial_ending:${s.trial_ends_at}`))) {
      const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY));
      await sendMail(trialEndingMail(company.language, company.email, daysLeft, `${appUrl()}/abonnement`)).catch(console.error);
      ending++;
    }
  }
  return { ending, ended };
}

/** Two to fourteen days after sign-up, a nudge toward the first useful step. */
async function activation(admin: Admin, now: Date) {
  let sent = 0;
  const { data: companies } = await admin
    .from('companies')
    .select('id, kind, email, language')
    .not('vat_number', 'is', null)
    .lt('created_at', new Date(now.getTime() - 2 * DAY).toISOString())
    .gt('created_at', new Date(now.getTime() - 14 * DAY).toISOString())
    .limit(500);
  for (const c of companies ?? []) {
    if (!c.email) continue;
    let idle = false;
    let path = '/';
    if (c.kind === 'contractor') {
      const { count } = await admin.from('price_requests').select('id', { count: 'exact', head: true }).eq('company_id', c.id).neq('status', 'draft');
      idle = (count ?? 0) === 0;
      path = '/nouvelle';
    } else if (c.kind === 'supplier') {
      const { count } = await admin
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', c.id)
        .eq('status', 'invited')
        .lt('created_at', new Date(now.getTime() - DAY).toISOString());
      idle = (count ?? 0) > 0;
    } else {
      const { count } = await admin.from('opportunities').select('id', { count: 'exact', head: true }).eq('company_id', c.id);
      idle = (count ?? 0) === 0;
      path = '/annonce/nouvelle';
    }
    if (idle && (await once(admin, c.id, 'activation'))) {
      await sendMail(activationMail(c.language as Lang, c.email, c.kind as Kind, `${appUrl()}${path}`)).catch(console.error);
      sent++;
    }
  }
  return sent;
}

/** Contractors that sent requests before but none for a month. */
async function winback(admin: Admin, now: Date) {
  let sent = 0;
  const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString();
  const { data: recent } = await admin.from('price_requests').select('company_id').gte('sent_at', monthAgo).limit(5000);
  const active = new Set((recent ?? []).map((r) => r.company_id));
  const { data: past } = await admin
    .from('price_requests')
    .select('company_id, company:companies(email, language)')
    .lt('sent_at', monthAgo)
    .gte('sent_at', new Date(now.getTime() - 120 * DAY).toISOString())
    .limit(5000);
  const seen = new Set<string>();
  const period = now.toISOString().slice(0, 7);
  for (const r of past ?? []) {
    if (active.has(r.company_id) || seen.has(r.company_id)) continue;
    seen.add(r.company_id);
    const company = r.company as unknown as { email: string | null; language: Lang } | null;
    if (company?.email && (await once(admin, r.company_id, `winback:${period}`))) {
      await sendMail(winbackMail(company.language, company.email, `${appUrl()}/nouvelle`)).catch(console.error);
      sent++;
    }
  }
  return sent;
}

/** Mondays: each contractor hears about the verified contractors who joined last week. */
async function newcomers(admin: Admin, now: Date) {
  if (now.getUTCDay() !== 1) return 0;
  const { data: joined } = await admin
    .from('companies')
    .select('id, name, postal_code, city, company_trades(trade_id)')
    .eq('kind', 'contractor')
    .eq('verification_status', 'verified')
    .gte('created_at', new Date(now.getTime() - 7 * DAY).toISOString())
    .limit(50);
  if (!joined?.length) return 0;
  const { data: trades } = await admin.from('trades').select('id, label_fr, label_nl');
  const label = new Map((trades ?? []).map((t) => [t.id, t]));
  const { data: readers } = await admin
    .from('companies')
    .select('id, email, language, postal_code')
    .eq('kind', 'contractor')
    .eq('news_emails', true)
    .not('email', 'is', null)
    .limit(5000);
  const week = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const r of readers ?? []) {
    const lang = r.language as Lang;
    const others = joined
      .filter((j) => j.id !== r.id)
      .sort((a, b) => Number(b.postal_code?.[0] === r.postal_code?.[0]) - Number(a.postal_code?.[0] === r.postal_code?.[0]))
      .slice(0, 10)
      .map((j) => ({
        name: j.name,
        trades: ((j.company_trades as { trade_id: number }[] | null) ?? [])
          .map((ct) => label.get(ct.trade_id))
          .filter(Boolean)
          .slice(0, 3)
          .map((t) => (lang === 'nl' ? t!.label_nl : t!.label_fr))
          .join(', '),
        place: [j.postal_code, j.city].filter(Boolean).join(' '),
      }));
    if (!others.length || !(await once(admin, r.id, `newcomers:${week}`))) continue;
    await sendMail(newcomersMail(lang, r.email!, others, `${appUrl()}/reseau`)).catch(console.error);
    sent++;
  }
  return sent;
}

/** The referrer gets its reward once the company it brought in is verified. */
async function referrals(admin: Admin, now: Date) {
  let granted = 0;
  const { data: referred } = await admin
    .from('companies')
    .select('id, name, referred_by')
    .not('referred_by', 'is', null)
    .eq('verification_status', 'verified')
    .limit(500);
  for (const c of referred ?? []) {
    const { count } = await admin.from('referral_rewards').select('id', { count: 'exact', head: true }).eq('referred_id', c.id);
    if (count) continue;
    const { data: referrer } = await admin
      .from('companies')
      .select('id, kind, email, language, stripe_customer_id')
      .eq('id', c.referred_by!)
      .single();
    if (!referrer || referrer.kind === 'architect') continue;

    let reward: { kind: string; days?: number; amount_ex_vat?: number; fr: string; nl: string };
    if (referrer.kind === 'supplier') {
      reward = { kind: 'commission_credit', amount_ex_vat: REWARD_EX_VAT, fr: `${REWARD_LABEL} € HTVA déduits de votre prochain relevé de commission`, nl: `€ ${REWARD_LABEL} excl. btw afgetrokken van uw volgende commissieoverzicht` };
    } else {
      const { data: sub } = await admin.from('subscriptions').select('plan, provider_subscription_id, trial_ends_at').eq('company_id', referrer.id).single();
      const stripe = stripeClient();
      // Paying customer: credit on the next Stripe invoice (VAT included in the credit).
      const credited =
        sub?.provider_subscription_id && referrer.stripe_customer_id && stripe
          ? await stripe.customers
              .createBalanceTransaction(
                referrer.stripe_customer_id,
                { amount: -Math.round(REWARD_EX_VAT * 1.21 * 100), currency: 'eur', description: `Parrainage ${c.name}` },
                { idempotencyKey: `referral-${c.id}` },
              )
              .then(() => true)
              .catch(() => false)
          : false;
      // A paying customer whose Stripe credit failed: try again on the next run.
      if (!credited && sub?.provider_subscription_id) continue;
      if (credited) {
        reward = { kind: 'stripe_balance', amount_ex_vat: REWARD_EX_VAT, fr: `${REWARD_LABEL} € HTVA déduits de votre prochaine facture`, nl: `€ ${REWARD_LABEL} excl. btw afgetrokken van uw volgende factuur` };
      } else {
        // Test or on trial: a month of Premium, added to any trial left.
        const from = Math.max(now.getTime(), sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0);
        await admin
          .from('subscriptions')
          .update({ plan: TRIAL_PLAN, status: 'active', trial_ends_at: new Date(from + REWARD_DAYS * DAY).toISOString(), updated_at: now.toISOString() })
          .eq('company_id', referrer.id)
          .is('provider_subscription_id', null);
        reward = { kind: 'pro_days', days: REWARD_DAYS, fr: 'un mois de plan Premium offert', nl: 'een maand Premium gratis' };
      }
    }
    const { error } = await admin.from('referral_rewards').insert({
      referrer_id: referrer.id,
      referred_id: c.id,
      kind: reward.kind,
      days: reward.days ?? null,
      amount_ex_vat: reward.amount_ex_vat ?? null,
    });
    if (error) continue;
    granted++;
    if (referrer.email) {
      await sendMail(referralRewardMail(referrer.language as Lang, referrer.email, c.name, reward, `${appUrl()}/reglages`)).catch(console.error);
    }
  }
  return granted;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  if (!(await isCron(req, admin))) return json({ error: 'unauthorized' }, 401);
  const now = new Date();
  const trials = await endTrials(admin, now);
  const activated = await activation(admin, now);
  const won = await winback(admin, now);
  const rewarded = await referrals(admin, now);
  const news = await newcomers(admin, now);
  return json({ trials, activation: activated, winback: won, referrals: rewarded, newcomers: news });
});
