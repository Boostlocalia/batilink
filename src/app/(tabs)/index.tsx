import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type RequestRow = {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'awarded';
  postal_code: string;
  city: string | null;
  reply_by: string;
  quotes: { status: string }[];
};

const STATUS_TONE = { draft: 'neutral', sent: 'warn', closed: 'neutral', awarded: 'good' } as const;

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { company } = useSession();
  const theme = useTheme();
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase
      .from('price_requests')
      .select('id, title, status, postal_code, city, reply_by, quotes(status)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return setFailed(true);
    setRequests(data as RequestRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = requests?.filter((r) => r.status === 'sent').length ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="label" themeColor="textSecondary">
            {company?.name}
          </ThemedText>
          <ThemedText type="title">{t.home.hello}</ThemedText>
          <ThemedText themeColor="textSecondary">{t.home.lead(open)}</ThemedText>
        </View>
        <Button label={t.home.newRequest} variant="signal" onPress={() => router.navigate('/nouvelle')} />
      </View>

      <Card>
        <ThemedText type="subtitle">{t.home.myRequests}</ThemedText>
        {failed ? (
          <View style={{ gap: Spacing.two }}>
            <ThemedText themeColor="danger">{t.common.error}</ThemedText>
            <Button label={t.common.retry} variant="ghost" small onPress={load} />
          </View>
        ) : requests === null ? (
          <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
        ) : requests.length === 0 ? (
          <ThemedText themeColor="textSecondary">{t.home.empty}</ThemedText>
        ) : (
          requests.map((r, i) => {
            const invited = r.quotes.length;
            const submitted = r.quotes.filter((q) => q.status !== 'invited' && q.status !== 'declined').length;
            return (
              <Link key={r.id} href={{ pathname: '/demande/[id]', params: { id: r.id } }} asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{r.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.postal_code} {r.city ?? ''} · {formatDate(r.reply_by, locale)}
                    </ThemedText>
                  </View>
                  <View style={styles.rowChips}>
                    <Chip label={t.home.status[r.status]} tone={STATUS_TONE[r.status]} />
                    {r.status !== 'draft' ? <Chip label={t.home.offers(submitted, invited)} /> : null}
                  </View>
                </Pressable>
              </Link>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.three },
  headerText: { gap: Spacing.one, flexShrink: 1, minWidth: 220 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowText: { flexShrink: 1, minWidth: 200 },
  rowChips: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
});
