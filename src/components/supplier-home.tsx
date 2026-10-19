import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { SupplierBanners } from '@/components/home-banners';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import { useSession } from '@/lib/session';
import { SUPPLIER_COMMISSION_ACTIVE } from '@/lib/commission';
import { supabase } from '@/lib/supabase';

type QuoteStatus = 'invited' | 'submitted' | 'declined' | 'awarded' | 'not_selected';
type Space = {
  quotes: {
    id: string;
    status: QuoteStatus;
    total_ex_vat: number | null;
    request: { title: string; city: string | null; postal_code: string; reply_by: string; company: { name: string } | null } | null;
  }[];
  orders: { id: string; number: string; title: string; status: string; total_ex_vat: number; contractor: { name: string } | null }[];
  bills: { id: string; number: string; month: string; amount_inc_vat: number; status: string }[];
  this_month: { sales_ex_vat: number; commission_ex_vat: number };
  stats: { invited: number; answered: number; won: number; won_ex_vat: number };
};

const QUOTE_TONE = { invited: 'warn', submitted: 'neutral', declined: 'neutral', awarded: 'good', not_selected: 'neutral' } as const;

/** Home of a signed-in supplier: what to answer, what was won, what is owed. */
export function SupplierHome() {
  const { t, locale } = useI18n();
  const s = t.growth.supplierSpace;
  const { company } = useSession();
  const theme = useTheme();
  const [space, setSpace] = useState<Space | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase.functions.invoke('supplier-space', { method: 'GET' });
    if (error) return setFailed(true);
    setSpace(data as Space);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Answering uses the same pages as the e-mailed links, opened with a fresh short link.
  const open = async (kind: 'quote' | 'order', id: string) => {
    setOpening(id);
    const { data } = await supabase.functions.invoke('supplier-space', { body: { open: kind, id } });
    setOpening(null);
    const path = (data as { path?: string } | null)?.path;
    if (!path) return;
    if (Platform.OS === 'web') window.location.assign(path);
    else router.push(path as never);
  };

  const eur = (n: number) => formatEuro(n, locale);
  const rate = space && space.stats.invited ? Math.round((space.stats.answered / space.stats.invited) * 100) : null;

  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="label" themeColor="textSecondary">
          {company?.name}
        </ThemedText>
        <ThemedText type="title">{s.title}</ThemedText>
        {company?.verification_status === 'pending' ? <ThemedText themeColor="textSecondary">{s.pending}</ThemedText> : null}
      </View>

      {failed ? (
        <Card>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={load} />
        </Card>
      ) : !space ? (
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      ) : (
        <>
          <SupplierBanners
            toAnswer={space.quotes.filter((q) => q.status === 'invited').length}
            won={space.stats.won}
            onAnswer={() => {
              const next = space.quotes.find((q) => q.status === 'invited');
              if (next) open('quote', next.id);
            }}
          />
          <View style={styles.stats}>
            <Stat label={s.stats.invited} value={String(space.stats.invited)} />
            <Stat label={s.stats.answered} value={rate === null ? '–' : `${rate} %`} />
            <Stat label={s.stats.won} value={String(space.stats.won)} />
            <Stat label={s.stats.wonAmount} value={eur(space.stats.won_ex_vat)} />
          </View>

          <Card>
            <ThemedText type="smallBold">{s.month}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {SUPPLIER_COMMISSION_ACTIVE ? s.monthLine(eur(space.this_month.sales_ex_vat), eur(space.this_month.commission_ex_vat)) : s.monthSales(eur(space.this_month.sales_ex_vat))}
            </ThemedText>
          </Card>

          <Card>
            <ThemedText type="subtitle">{s.requests}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {s.tip}
            </ThemedText>
            {space.quotes.length === 0 ? (
              <ThemedText themeColor="textSecondary">{s.noRequests}</ThemedText>
            ) : (
              space.quotes.map((q, i) => (
                <View key={q.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{q.request?.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[q.request?.company?.name, `${q.request?.postal_code ?? ''} ${q.request?.city ?? ''}`.trim(), q.request?.reply_by ? formatDate(q.request.reply_by, locale) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </ThemedText>
                  </View>
                  <View style={styles.rowEnd}>
                    <Chip label={s.quoteStatus[q.status]} tone={QUOTE_TONE[q.status]} />
                    {q.status === 'invited' || q.status === 'submitted' ? (
                      <Button
                        label={q.status === 'invited' ? s.answer : s.view}
                        variant={q.status === 'invited' ? 'signal' : 'ghost'}
                        small
                        busy={opening === q.id}
                        onPress={() => open('quote', q.id)}
                      />
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <ThemedText type="subtitle">{s.orders}</ThemedText>
            {space.orders.length === 0 ? (
              <ThemedText themeColor="textSecondary">{s.noOrders}</ThemedText>
            ) : (
              space.orders.map((o, i) => (
                <View key={o.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">
                      {o.number} · {o.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {o.contractor?.name} · {eur(Number(o.total_ex_vat))}
                    </ThemedText>
                  </View>
                  <View style={styles.rowEnd}>
                    <Chip label={t.orders.status[o.status as keyof typeof t.orders.status] ?? o.status} />
                    <Button label={s.view} variant="ghost" small busy={opening === o.id} onPress={() => open('order', o.id)} />
                  </View>
                </View>
              ))
            )}
          </Card>

          {/* Commission statements only once supplier commission starts. */}
          {SUPPLIER_COMMISSION_ACTIVE || space.bills.length > 0 ? (
            <Card>
              <ThemedText type="subtitle">{s.bills}</ThemedText>
              {space.bills.length === 0 ? (
                <ThemedText themeColor="textSecondary">{s.noBills}</ThemedText>
              ) : (
                space.bills.map((b, i) => (
                  <View key={b.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold">{b.number}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {b.month.slice(0, 7)} · {eur(Number(b.amount_inc_vat))}
                      </ThemedText>
                    </View>
                    <Chip label={b.status === 'paid' ? s.billPaid : s.billOpen} tone={b.status === 'paid' ? 'good' : 'warn'} />
                  </View>
                ))
              )}
            </Card>
          ) : null}

          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={s.zones} variant="ghost" onPress={() => router.push('/zones')} />
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: 150, gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
  rowText: { flexShrink: 1, minWidth: 200, gap: Spacing.half },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
