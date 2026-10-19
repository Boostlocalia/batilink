import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Row = { id: string; name: string; city: string | null; postal_code: string | null; trade_ids: number[]; verified_at: string | null };
type Trade = { id: number; label_fr: string; label_nl: string };

/** Verified contractors who joined in the last 30 days, the same region first. */
export function NewContractors() {
  const { t, language, locale } = useI18n();
  const theme = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [trades, setTrades] = useState<Map<number, Trade>>(new Map());

  useFocusEffect(
    useCallback(() => {
      Promise.all([supabase.rpc('new_contractors', { p_days: 30 }), supabase.from('trades').select('id, label_fr, label_nl')]).then(
        ([list, labels]) => {
          setRows((list.data as Row[] | null) ?? []);
          setTrades(new Map(((labels.data as Trade[] | null) ?? []).map((x) => [x.id, x])));
        },
      );
    }, []),
  );

  if (!rows.length) return null;
  return (
    <Card>
      <ThemedText type="subtitle">{t.home.newcomers.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t.home.newcomers.lead}
      </ThemedText>
      {rows.map((r, i) => (
        <View key={r.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[`${r.postal_code ?? ''} ${r.city ?? ''}`.trim(), r.verified_at ? t.home.newcomers.since(formatDate(r.verified_at.slice(0, 10), locale)) : null]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
          <View style={styles.chips}>
            {r.trade_ids.slice(0, 3).map((id) => {
              const trade = trades.get(id);
              return trade ? <Chip key={id} label={language === 'nl' ? trade.label_nl : trade.label_fr} /> : null;
            })}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
