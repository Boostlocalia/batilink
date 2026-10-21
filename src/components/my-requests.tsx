import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export type RequestRow = {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'awarded';
  postal_code: string;
  city: string | null;
  reply_by: string;
  quotes: { status: string }[];
};

const STATUS_TONE = { draft: 'neutral', sent: 'warn', closed: 'neutral', awarded: 'good' } as const;

/** Offers a supplier actually sent (not just invited, not declined). */
export const receivedOffers = (r: RequestRow) => r.quotes.filter((q) => q.status !== 'invited' && q.status !== 'declined').length;

/** The company's price requests, newest first, reloaded each time the screen shows. */
export function useMyRequests() {
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
  return { requests, failed, reload: load };
}

/** The list of price requests; with `limit`, the first ones and a link to all. */
export function MyRequests({ requests, failed, reload, limit, title = true }: ReturnType<typeof useMyRequests> & { limit?: number; title?: boolean }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const shown = requests && limit ? requests.slice(0, limit) : requests;
  return (
    <Card>
      {title ? <ThemedText type="subtitle">{t.home.myRequests}</ThemedText> : null}
      {failed ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={reload} />
        </View>
      ) : shown === null ? (
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      ) : shown.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t.home.empty}</ThemedText>
      ) : (
        shown.map((r, i) => (
          <Link key={r.id} href={{ pathname: '/demande/[id]', params: { id: r.id } }} asChild>
            <Pressable style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }, pressed && { opacity: 0.7 }]}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{r.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.postal_code} {r.city ?? ''} · {formatDate(r.reply_by, locale)}
                </ThemedText>
              </View>
              <View style={styles.rowChips}>
                <Chip label={t.home.status[r.status]} tone={STATUS_TONE[r.status]} />
                {r.status !== 'draft' ? <Chip label={t.home.offers(receivedOffers(r), r.quotes.length)} /> : null}
              </View>
            </Pressable>
          </Link>
        ))
      )}
      {limit && requests && requests.length > limit ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={t.home.shortcuts.allRequests} variant="ghost" small onPress={() => router.push('/demandes')} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowText: { flexShrink: 1, minWidth: 200 },
  rowChips: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
});
