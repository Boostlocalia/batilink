import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CompleteProfileCard } from '@/components/complete-profile-card';
import { FounderCounter } from '@/components/founder-counter';
import { FounderStatus } from '@/components/founder-status';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen, Segmented } from '@/components/ui';
import { PlansBanner } from '@/components/home-banners';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatEuro } from '@/lib/format';
import { openPaymentPage } from '@/lib/orders';
import { PLANS, type Plan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { SELLS_PLANS } from '@/lib/store';
import { useTrial } from '@/lib/trial';
import { supabase } from '@/lib/supabase';

// No free plan to choose: after the trial a contractor picks one of the paid plans.
const ORDER: Plan[] = ['pro', 'full'];

export default function PlansScreen() {
  const { t, locale } = useI18n();
  const { plan: sessionPlan, company } = useSession();
  const g = t.growth.plans;
  const [billing, setBilling] = useState<'month' | 'year'>('year');
  const { onTrial, daysLeft: trialDays, ended: trialOver } = useTrial();
  // During the trial no plan is paid yet: every paid plan can be chosen.
  const current: Plan | null = onTrial ? null : sessionPlan;
  const theme = useTheme();
  const { paiement } = useLocalSearchParams<{ paiement?: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Payment happens on Stripe's page; the plan changes once Stripe confirms it.
  const open = async (key: string, body: object) => {
    // A plan belongs to a company: its details come first.
    if (!company) return router.push('/entreprise');
    setBusy(key);
    setFailed(null);
    const { data, error } = await supabase.functions.invoke('subscription', { body });
    setBusy(null);
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) return setFailed(t.plans.unavailable);
    await openPaymentPage(url);
  };

  if (!SELLS_PLANS) {
    return (
      <Screen>
        <ThemedText type="title">{t.plans.title}</ThemedText>
        <Card>
          <ThemedText type="smallBold">
            {onTrial ? g.trialLeft(trialDays ?? 0) : current && current !== 'free' ? `${t.plans.current} : ${t.plans.names[current]}` : t.plans.store.none}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.plans.store.lead}
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{t.plans.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.plans.lead}</ThemedText>
      </View>
      <PlansBanner />
      {!company ? <CompleteProfileCard text={t.signup.later.plans} /> : null}
      <FounderStatus fallback={<FounderCounter cta="page" />} />
      {onTrial ? (
        <Card style={{ borderColor: theme.signal }}>
          <ThemedText type="smallBold">{g.trialLeft(trialDays ?? 0)}</ThemedText>
        </Card>
      ) : trialOver ? (
        <ThemedText themeColor="textSecondary">{g.trialOver}</ThemedText>
      ) : null}
      <View style={styles.interval}>
        <Segmented
          signal
          value={billing}
          onChange={setBilling}
          options={[
            { value: 'month', label: g.monthly },
            { value: 'year', label: g.yearly },
          ]}
        />
        {/* The two free months only come with yearly billing. */}
        <Chip label={billing === 'year' ? g.yearlySave : g.yearlyHint} tone="signal" />
      </View>
      <View style={styles.plans}>
        {ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === current;
          const yearly = billing === 'year' && id !== 'free';
          const f = t.plans.features;
          const features: [boolean, string][] = [
            [true, f.searches(p.searchesPerMonth)],
            [true, f.network(p.networkExchangesPerMonth)],
            [p.verifiedBadge, f.badge],
            [p.suppliers !== 'none', f.suppliers(p.suppliers)],
            [p.pdfExport, f.pdf],
            [true, f.users(p.users)],
          ];
          return (
            <Card
              key={id}
              style={[styles.plan, isCurrent ? { borderColor: theme.brand, borderWidth: 2 } : id === 'full' && { borderColor: theme.signal, borderWidth: 2 }]}>
              <View style={styles.planHead}>
                <ThemedText type="subtitle">{t.plans.names[id]}</ThemedText>
                {isCurrent ? <Chip label={t.plans.current} tone="brand" /> : id === 'full' ? <Chip label={g.recommended} tone="signal" /> : null}
              </View>
              <View>
                <ThemedText type="smallBold" themeColor="signal" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  {t.plans.launch}
                </ThemedText>
                <ThemedText type="title">
                  {formatEuro(yearly ? p.priceYearExVat : p.priceExVat, locale).replace(/[,.]00/, '')}{' '}
                  <ThemedText type="small" themeColor="textSecondary">
                    {yearly ? g.perYear : t.plans.perMonth}
                  </ThemedText>
                </ThemedText>
                {yearly ? (
                  <ThemedText type="smallBold" themeColor="signal">
                    {g.perMonthEquivalent(formatEuro(Math.round((p.priceYearExVat / 12) * 100) / 100, locale))}
                  </ThemedText>
                ) : null}
              </View>
              <View style={{ gap: Spacing.two }}>
                {features.map(([included, label]) => (
                  <View key={label} style={styles.feature}>
                    <ThemedText type="smallBold" themeColor={included ? 'signal' : 'textSecondary'}>
                      {included ? '✓' : '–'}
                    </ThemedText>
                    <ThemedText type="small" themeColor={included ? 'text' : 'textSecondary'} style={{ flex: 1 }}>
                      {label}
                    </ThemedText>
                  </View>
                ))}
              </View>
              <Button
                label={isCurrent ? t.plans.current : t.plans.choose}
                variant={isCurrent ? 'ghost' : 'signal'}
                // Going back to the free plan is a cancellation, done from "Manage".
                disabled={isCurrent || id === 'free'}
                busy={busy === id}
                onPress={() => open(id, { plan: id, interval: billing })}
              />
            </Card>
          );
        })}
      </View>
      {paiement === 'ok' ? <ThemedText themeColor="good">{t.plans.thanks}</ThemedText> : null}
      {failed ? <ThemedText themeColor="danger">{failed}</ThemedText> : null}
      <ThemedText themeColor="textSecondary">{g.roi}</ThemedText>
      {current && current !== 'free' ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.plans.manage} variant="ghost" busy={busy === 'portal'} onPress={() => open('portal', { action: 'portal' })} />
        </View>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {t.plans.secure}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  plan: { flexGrow: 1, flexBasis: 260 },
  interval: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feature: { flexDirection: 'row', gap: Spacing.two },
});
