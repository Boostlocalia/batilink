import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type ContractorRow = { id: string; name: string; city: string | null; postal_code: string | null; trade_ids: number[]; verified_at: string | null; total: number };
type Trade = { id: number; label_fr: string; label_nl: string };

/** Trade labels by id, for the chips under each contractor. */
export function useTrades() {
  const [trades, setTrades] = useState<Map<number, Trade>>(new Map());
  useEffect(() => {
    supabase
      .from('trades')
      .select('id, label_fr, label_nl')
      .then(({ data }) => setTrades(new Map(((data as Trade[] | null) ?? []).map((x) => [x.id, x]))));
  }, []);
  return trades;
}

/** One verified contractor, with a button to write to them. */
export function ContractorItem({ row, trades, first }: { row: ContractorRow; trades: Map<number, Trade>; first: boolean }) {
  const { t, language, locale } = useI18n();
  const { company } = useSession();
  const theme = useTheme();
  const c = t.home.contractors;
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: theme.line }]}>
      <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
        <ThemedText type="smallBold">{row.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[`${row.postal_code ?? ''} ${row.city ?? ''}`.trim(), row.verified_at ? c.since(formatDate(row.verified_at.slice(0, 10), locale)) : null].filter(Boolean).join(' · ')}
        </ThemedText>
        <View style={styles.chips}>
          {row.trade_ids.slice(0, 3).map((id) => {
            const trade = trades.get(id);
            return trade ? <Chip key={id} label={language === 'nl' ? trade.label_nl : trade.label_fr} /> : null;
          })}
        </View>
      </View>
      {company ? (
        <Button label={c.write} variant="ghost" small onPress={() => router.push({ pathname: '/discussion/nouvelle', params: { company: row.id, name: row.name } })} />
      ) : null}
    </View>
  );
}

/** Home card: verified contractors already on BatiNode, the same region first. */
export function RegisteredContractors() {
  const { t } = useI18n();
  const c = t.home.contractors;
  const trades = useTrades();
  const [rows, setRows] = useState<ContractorRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('registered_contractors', { p_limit: 5 }).then(({ data }) => setRows((data as ContractorRow[] | null) ?? []));
    }, []),
  );

  if (rows === null) return null;
  const total = rows[0]?.total ?? 0;
  return (
    <Card>
      <ThemedText type="subtitle">{c.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {total ? c.lead(total) : c.empty}
      </ThemedText>
      {rows.map((r, i) => (
        <ContractorItem key={r.id} row={r} trades={trades} first={i === 0} />
      ))}
      {total > rows.length ? <Button label={c.all} variant="ghost" small onPress={() => router.push('/entrepreneurs')} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: 2 },
});
