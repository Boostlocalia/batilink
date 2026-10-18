// Daily job (x-cron-secret): ends Pro trials, sends activation and retention
// e-mails, and grants referral rewards once the referred company is verified.
// Each e-mail goes once per company (lifecycle_messages), so reruns are safe.

import { sendMail, type Lang } from '../_shared/email.ts';
import {
  activationMail,
  referralRewardMail,
  trialEndedMail,
  trialEndingMail,
  winbackMail,
  type Kind,
} from '../_shared/growth-mail.ts';
import { logEvent } from '../_shared/events.ts';
import { stripeClient } from '../_shared/stripe.ts';
import { adminClient, appUrl, json } from '../_shared/supabase.ts';

type Admin = ReturnType<typeof adminClient>;
const DAY = 86_400_000;
const REWARD_EX_VAT = 39;
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
    .eq('plan', 'pro')
    .is('provider_subscription_id', null)
    .not('trial_ends_at', 'is', null)
    .lt('trial_ends_at', new Date(now.getTime() + 3 * DAY).toISOString());
  for (const s of subs ?? []) {
    const company = s.company as unknown as { email: string | null; language: Lang } | null;
    const end = new Date(s.trial_ends_at!);
    if (end <= now) {
      await admin.from('subscriptions').update({ plan: 'free', updated_at: now.toISOString() }).eq('company_id', s.company_id).eq('plan', 'pro').is('provider_subscription_id', null);
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
      reward = { kind: 'commission_credit', amount_ex_vat: REWARD_EX_VAT, fr: `${REWARD_EX_VAT} € HTVA déduits de votre prochain relevé de commission`, nl: `€ ${REWARD_EX_VAT} excl. btw afgetrokken van uw volgende commissieoverzicht` };
    } else {
      const { data: sub } = await admin.from('subscriptions').select('plan, provider_subscription_id, trial_ends_at').eq('company_id', referrer.id).single();
      const stripe = stripeClient();
      if (sub?.provider_subscription_id && referrer.stripe_customer_id && stripe) {
        // Paying customer: credit on the next Stripe invoice (VAT included in the credit).
        await stripe.customers.createBalanceTransaction(
          referrer.stripe_customer_id,
          { amount: -Math.round(REWARD_EX_VAT * 1.21 * 100), currency: 'eur', description: `Parrainage ${c.name}` },
          { idempotencyKey: `referral-${c.id}` },
        );
        reward = { kind: 'stripe_balance', amount_ex_vat: REWARD_EX_VAT, fr: `${REWARD_EX_VAT} € HTVA déduits de votre prochaine facture`, nl: `€ ${REWARD_EX_VAT} excl. btw afgetrokken van uw volgende factuur` };
      } else {
        // Free or on trial: a month of Pro, added to any trial left.
        const from = Math.max(now.getTime(), sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0);
        await admin
          .from('subscriptions')
          .update({ plan: sub?.plan === 'full' ? 'full' : 'pro', status: 'active', trial_ends_at: new Date(from + REWARD_DAYS * DAY).toISOString(), updated_at: now.toISOString() })
          .eq('company_id', referrer.id)
          .is('provider_subscription_id', null);
        reward = { kind: 'pro_days', days: REWARD_DAYS, fr: 'un mois de plan Pro offert', nl: 'een maand Pro gratis' };
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
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const admin = adminClient();
  const now = new Date();
  const trials = await endTrials(admin, now);
  const activated = await activation(admin, now);
  const won = await winback(admin, now);
  const rewarded = await referrals(admin, now);
  return json({ trials, activation: activated, winback: won, referrals: rewarded });
});
