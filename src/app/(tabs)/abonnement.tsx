import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatEuro } from '@/lib/format';
import { openPaymentPage } from '@/lib/orders';
import { PLANS, type Plan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { useTrial } from '@/lib/trial';
import { supabase } from '@/lib/supabase';

const ORDER: Plan[] = ['free', 'pro', 'full'];

export default function PlansScreen() {
  const { t, locale } = useI18n();
  const { plan: sessionPlan } = useSession();
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
    setBusy(key);
    setFailed(null);
    const { data, error } = await supabase.functions.invoke('subscription', { body });
    setBusy(null);
    const url = (data as { url?: string } | null)?.url;
    if (error || !url) return setFailed(t.plans.unavailable);
    await openPaymentPage(url);
  };

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{t.plans.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.plans.lead}</ThemedText>
      </View>
      {onTrial ? (
        <Card style={{ borderColor: theme.signal }}>
          <ThemedText type="smallBold">{g.trialLeft(trialDays ?? 0)}</ThemedText>
        </Card>
      ) : trialOver ? (
        <ThemedText themeColor="textSecondary">{g.trialOver}</ThemedText>
      ) : null}
      <View style={styles.interval}>
        <Segmented
          value={billing}
          onChange={setBilling}
          options={[
            { value: 'month', label: g.monthly },
            { value: 'year', label: g.yearly },
          ]}
        />
        <Chip label={g.yearlySave} tone="good" />
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
                {isCurrent ? <Chip label={t.plans.current} tone="brand" /> : id === 'full' ? <Chip label={g.recommended} tone="good" /> : null}
              </View>
              <View>
                <ThemedText type="title">
                  {formatEuro(yearly ? p.priceYearExVat : p.priceExVat, locale).replace(/[,.]00/, '')}{' '}
                  <ThemedText type="small" themeColor="textSecondary">
                    {yearly ? g.perYear : t.plans.perMonth}
                  </ThemedText>
                </ThemedText>
                {yearly ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {g.perMonthEquivalent(formatEuro(Math.round((p.priceYearExVat / 12) * 100) / 100, locale))}
                  </ThemedText>
                ) : null}
              </View>
              <View style={{ gap: Spacing.two }}>
                {features.map(([included, label]) => (
                  <View key={label} style={styles.feature}>
                    <ThemedText type="smallBold" themeColor={included ? 'good' : 'textSecondary'}>
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
                variant={isCurrent ? 'ghost' : id === 'full' ? 'signal' : 'primary'}
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
