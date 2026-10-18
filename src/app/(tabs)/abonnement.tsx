import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatEuro } from '@/lib/format';
import { openPaymentPage } from '@/lib/orders';
import { PLANS, type Plan } from '@/lib/plans';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ORDER: Plan[] = ['free', 'pro', 'full'];

export default function PlansScreen() {
  const { t, locale } = useI18n();
  const { plan: current } = useSession();
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
      <View style={styles.plans}>
        {ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = id === current;
          const f = t.plans.features;
          const features: [boolean, string][] = [
            [true, f.searches(p.searchesPerMonth)],
            [true, f.network(p.network)],
            [p.verifiedBadge, f.badge],
            [true, f.requests(p.priceRequestsPerMonth, p.suppliersPerRequest)],
            [p.pdfExport, f.pdf],
            [true, f.users(p.users)],
          ];
          return (
            <Card key={id} style={[styles.plan, isCurrent && { borderColor: theme.brand, borderWidth: 2 }]}>
              <View style={styles.planHead}>
                <ThemedText type="subtitle">{t.plans.names[id]}</ThemedText>
                {isCurrent ? <Chip label={t.plans.current} tone="brand" /> : null}
              </View>
              <ThemedText type="title">
                {formatEuro(p.priceExVat, locale).replace(/[,.]00/, '')}{' '}
                <ThemedText type="small" themeColor="textSecondary">
                  {t.plans.perMonth}
                </ThemedText>
              </ThemedText>
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
                onPress={() => open(id, { plan: id })}
              />
            </Card>
          );
        })}
      </View>
      {paiement === 'ok' ? <ThemedText themeColor="good">{t.plans.thanks}</ThemedText> : null}
      {failed ? <ThemedText themeColor="danger">{failed}</ThemedText> : null}
      {current !== 'free' ? (
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
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feature: { flexDirection: 'row', gap: Spacing.two },
});
