import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Agreements } from '@/components/agreements';
import { ArchitectBanners } from '@/components/home-banners';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Option, Screen, Segmented } from '@/components/ui';
import { UpgradeCard } from '@/components/upgrade-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import { loadTrades, OPPORTUNITY_COLUMNS, type Opportunity, type Trade } from '@/lib/network';
import { useNetworkLeft } from '@/lib/network-quota';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type View_ = 'posts' | 'mine' | 'agreements';

export default function NetworkScreen() {
  const { t, language, locale } = useI18n();
  const { company, canUseNetwork } = useSession();
  const theme = useTheme();
  const architect = company?.kind === 'architect';
  const left = useNetworkLeft();
  const [view, setView] = useState<View_>(architect ? 'mine' : 'posts');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeFilter, setTradeFilter] = useState<number | null>(null);
  const [posts, setPosts] = useState<Opportunity[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    if (!trades.length) setTrades(await loadTrades());
    if (view === 'agreements') return;
    let query = supabase.from('opportunities').select(OPPORTUNITY_COLUMNS).order('created_at', { ascending: false }).limit(50);
    if (view === 'mine') query = query.eq('company_id', company!.id);
    else query = query.eq('status', 'open').neq('company_id', company!.id);
    if (tradeFilter !== null) query = query.contains('trade_ids', [tradeFilter]);
    const { data, error } = await query;
    if (error) return setFailed(true);
    setPosts(data as unknown as Opportunity[]);
  }, [view, tradeFilter, company, trades.length]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tradeLabel = (id: number) => {
    const trade = trades.find((x) => x.id === id);
    return trade ? (language === 'fr' ? trade.label_fr : trade.label_nl) : '';
  };

  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title">{t.network.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{t.network.lead}</ThemedText>
      </View>

      {architect ? <ArchitectBanners onBrowse={() => setView('mine')} /> : null}

      <Segmented<View_>
        value={view}
        onChange={(v) => {
          setPosts(null);
          setView(v);
        }}
        options={[
          // Architects only post: the list of other posts is for contractors.
          ...(architect ? [] : [{ value: 'posts' as const, label: t.network.tabs.posts }]),
          { value: 'mine', label: t.network.tabs.mine },
          { value: 'agreements', label: t.network.tabs.agreements },
        ]}
      />

      {left !== null ? <ThemedText type="small" themeColor="textSecondary">{t.growth.plans.networkLeft(left)}</ThemedText> : null}
      {view !== 'agreements' ? (
        left === 0 ? (
          <UpgradeCard reason="network" />
        ) : canUseNetwork ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              label={architect ? t.network.publishProject : t.network.publish}
              variant="signal"
              onPress={() => router.push('/annonce/nouvelle')}
            />
          </View>
        ) : (
          <Card style={{ backgroundColor: theme.warnBackground, borderColor: theme.warnBackground }}>
            <ThemedText type="small" themeColor="warn">
              {t.network.upgrade}
            </ThemedText>
          </Card>
        )
      ) : null}

      {view === 'posts' ? (
        <View style={styles.wrap}>
          <Option label={t.network.allTrades} selected={tradeFilter === null} onPress={() => setTradeFilter(null)} />
          {trades.map((trade) => (
            <Option key={trade.id} label={tradeLabel(trade.id)} selected={tradeFilter === trade.id} onPress={() => setTradeFilter(trade.id)} />
          ))}
        </View>
      ) : null}

      {view === 'agreements' ? (
        <Agreements />
      ) : failed ? (
        <Card>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={load} />
        </Card>
      ) : !posts ? (
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      ) : posts.length === 0 ? (
        <Card>
          <ThemedText themeColor="textSecondary">{t.network.empty}</ThemedText>
        </Card>
      ) : (
        <View style={styles.grid}>
          {posts.map((p) => (
            <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push(`/annonce/${p.id}`)} style={styles.cell}>
              <Card style={{ flex: 1 }}>
                <View style={styles.wrap}>
                  <Chip label={p.kind === 'architect_project' ? t.network.project : t.network.subcontract} tone="brand" />
                  {p.status !== 'open' ? <Chip label={t.network.detail.closed} /> : null}
                  {view === 'mine' ? <Chip label={t.network.answers(p.responses?.[0]?.count ?? 0)} tone="warn" /> : null}
                </View>
                <ThemedText type="subtitle">{p.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                  {p.description}
                </ThemedText>
                <View style={styles.wrap}>
                  {p.trade_ids.map((id) => (
                    <Chip key={id} label={tradeLabel(id)} />
                  ))}
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {[
                    `${p.postal_code} ${p.city ?? ''}`.trim(),
                    p.starts_on ? t.network.startsOn(formatDate(p.starts_on, locale)) : null,
                    p.budget_ex_vat !== null ? t.network.budget(formatEuro(Number(p.budget_ex_vat), locale)) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
                {view === 'posts' && p.company ? (
                  <View style={styles.wrap}>
                    <ThemedText type="smallBold">{p.company.name}</ThemedText>
                    {p.company.verification_status === 'verified' ? <Chip label={t.verification.status.verified} tone="good" /> : null}
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center' },
  // One column on phones, two on tablets and laptops.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 320, minWidth: 260 },
});
