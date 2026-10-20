import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ContractorItem, useTrades, type ContractorRow } from '@/components/registered-contractors';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

const PAGE = 50;

/** Every verified contractor on BatiNode, searchable by name, town or postal code. */
export default function ContractorsScreen() {
  const { t } = useI18n();
  const c = t.home.contractors;
  const trades = useTrades();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ContractorRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('contractor_directory', { p_query: query.trim() || null, p_limit: PAGE, p_offset: 0 });
      if (live) setRows((data as ContractorRow[] | null) ?? []);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const more = async () => {
    setBusy(true);
    const { data } = await supabase.rpc('contractor_directory', { p_query: query.trim() || null, p_limit: PAGE, p_offset: rows?.length ?? 0 });
    setBusy(false);
    setRows((list) => [...(list ?? []), ...((data as ContractorRow[] | null) ?? [])]);
  };

  const total = rows?.[0]?.total ?? 0;
  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: c.title }} />
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{c.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{c.pageLead}</ThemedText>
      </View>
      <Field label={c.search} value={query} onChangeText={setQuery} />
      <Card>
        {rows === null ? (
          <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
        ) : rows.length === 0 ? (
          <ThemedText themeColor="textSecondary">{query.trim() ? c.none : c.empty}</ThemedText>
        ) : (
          rows.map((r, i) => <ContractorItem key={r.id} row={r} trades={trades} first={i === 0} />)
        )}
        {rows && total > rows.length ? <Button label={c.more} variant="ghost" small busy={busy} onPress={more} /> : null}
      </Card>
    </Screen>
  );
}
