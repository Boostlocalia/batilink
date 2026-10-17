import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import { compareOffers, type Offer, type RequestItem } from '@/lib/quotes';
import { supabase } from '@/lib/supabase';

type Request = { id: string; title: string; status: 'draft' | 'sent' | 'closed' | 'awarded'; postal_code: string; city: string | null };

const LABEL_WIDTH = 190;
const OFFER_WIDTH = 168;

export default function CompareScreen() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [req, its, qs] = await Promise.all([
      supabase.from('price_requests').select('id, title, status, postal_code, city').eq('id', id).single(),
      supabase.from('request_items').select('id, label, quantity, unit').eq('request_id', id).order('position'),
      supabase
        .from('quotes')
        .select('id, status, delivery_fee, lead_time_days, valid_until, comment, reminded_at, supplier:companies(name), quote_items(item_id, unit_price)')
        .eq('request_id', id)
        .order('created_at'),
    ]);
    if (req.error || its.error || qs.error) return setFailed(true);
    setFailed(false);
    setRequest(req.data as Request);
    setItems((its.data ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })));
    setOffers(
      (qs.data ?? []).map((q) => ({
        id: q.id,
        supplierName: (q.supplier as unknown as { name: string } | null)?.name ?? '',
        status: q.status,
        deliveryFee: q.delivery_fee === null ? null : Number(q.delivery_fee),
        leadTimeDays: q.lead_time_days,
        validUntil: q.valid_until,
        comment: q.comment,
        remindedAt: q.reminded_at,
        prices: Object.fromEntries((q.quote_items ?? []).map((p) => [p.item_id, Number(p.unit_price)])),
      })),
    );
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const award = async (quoteId: string) => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('award-quote', { body: { quote_id: quoteId } });
    setBusy(false);
    setConfirming(null);
    if (error) return setFailed(true);
    load();
  };

  const { priced, totals, cheapestId, fastestId, lowestUnitPrice } = compareOffers(items, offers);
  const waiting = offers.filter((o) => o.status === 'invited' || o.status === 'declined');
  const eur = (n: number) => formatEuro(n, locale);
  const cell = (highlight: boolean) => [styles.cell, highlight && { backgroundColor: theme.goodBackground }];
  const rowBorder = { borderTopWidth: 1, borderTopColor: theme.line };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: request?.title ?? '' }} />
      {sent ? (
        <Card style={{ backgroundColor: theme.goodBackground, borderColor: theme.goodBackground }}>
          <ThemedText type="smallBold" themeColor="good">
            {t.request.sent(Number(sent))}
          </ThemedText>
        </Card>
      ) : null}

      {failed ? (
        <Card>
          <ThemedText themeColor="danger">{t.common.error}</ThemedText>
          <Button label={t.common.retry} variant="ghost" small onPress={load} />
        </Card>
      ) : !request ? (
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      ) : (
        <>
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="title">{request.title}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {request.postal_code} {request.city ?? ''} · {t.compare.lead(priced.length, offers.length)}
            </ThemedText>
          </View>

          {priced.length === 0 ? (
            <Card>
              <ThemedText themeColor="textSecondary">{t.compare.none}</ThemedText>
            </Card>
          ) : (
            <Card style={{ paddingHorizontal: 0 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ paddingHorizontal: Spacing.three }}>
                  <View style={styles.row}>
                    <View style={{ width: LABEL_WIDTH }} />
                    {priced.map((o) => (
                      <View key={o.id} style={[styles.cell, styles.headCell]}>
                        <ThemedText type="smallBold" style={styles.right}>
                          {o.supplierName}
                        </ThemedText>
                        {o.id === cheapestId ? <Chip label={t.compare.bestPrice} tone="good" /> : null}
                        {o.id === fastestId ? <Chip label={t.compare.fastest} tone="brand" /> : null}
                        {o.status === 'awarded' ? <Chip label={t.compare.chosen} tone="warn" /> : null}
                      </View>
                    ))}
                  </View>

                  {items.map((item) => (
                    <View key={item.id} style={[styles.row, rowBorder]}>
                      <View style={styles.label}>
                        <ThemedText type="small">{item.label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.quantity} {t.units[item.unit as keyof typeof t.units] ?? item.unit}
                        </ThemedText>
                      </View>
                      {priced.map((o) => {
                        const unit = o.prices[item.id];
                        return (
                          <View key={o.id} style={cell(unit !== undefined && unit === lowestUnitPrice[item.id])}>
                            {unit === undefined ? (
                              <ThemedText type="number" themeColor="textSecondary" style={styles.right}>
                                –
                              </ThemedText>
                            ) : (
                              <>
                                <ThemedText type="number" style={styles.right}>
                                  {eur(unit * item.quantity)}
                                </ThemedText>
                                <ThemedText type="small" themeColor="textSecondary" style={styles.right}>
                                  {eur(unit)} / {t.units[item.unit as keyof typeof t.units] ?? item.unit}
                                </ThemedText>
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}

                  <Line label={t.compare.delivery} border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={styles.cell}>
                        <ThemedText type="number" style={styles.right}>
                          {!o.deliveryFee ? t.common.free : eur(o.deliveryFee)}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  <Line label={t.compare.leadTime} border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={cell(o.id === fastestId)}>
                        <ThemedText type="number" style={styles.right}>
                          {o.leadTimeDays === null ? '–' : t.common.days(o.leadTimeDays)}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  <Line label={t.compare.validUntil} border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={styles.cell}>
                        <ThemedText type="small" style={styles.right}>
                          {o.validUntil ? formatDate(o.validUntil, locale) : '–'}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  <Line label={t.compare.totalExVat} strong border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={cell(o.id === cheapestId)}>
                        <ThemedText type="subtitle" style={[styles.right, styles.tabular]}>
                          {eur(totals.get(o.id)!.exVat)}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  <Line label={t.compare.vat} border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={styles.cell}>
                        <ThemedText type="number" themeColor="textSecondary" style={styles.right}>
                          {eur(totals.get(o.id)!.vat)}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  <Line label={t.compare.totalIncVat} border={rowBorder}>
                    {priced.map((o) => (
                      <View key={o.id} style={styles.cell}>
                        <ThemedText type="number" style={styles.right}>
                          {eur(totals.get(o.id)!.incVat)}
                        </ThemedText>
                      </View>
                    ))}
                  </Line>
                  {request.status === 'sent' ? (
                    <Line label="" border={rowBorder}>
                      {priced.map((o) => (
                        <View key={o.id} style={[styles.cell, { gap: Spacing.one }]}>
                          {confirming === o.id ? (
                            <>
                              <ThemedText type="small">{t.compare.confirm(o.supplierName)}</ThemedText>
                              <Button label={t.compare.choose} variant="signal" small busy={busy} onPress={() => award(o.id)} />
                              <Button label={t.common.cancel} variant="ghost" small onPress={() => setConfirming(null)} />
                            </>
                          ) : (
                            <Button label={t.compare.choose} small onPress={() => setConfirming(o.id)} />
                          )}
                        </View>
                      ))}
                    </Line>
                  ) : null}
                </View>
              </ScrollView>
            </Card>
          )}

          {priced.some((o) => o.comment) ? (
            <Card>
              <ThemedText type="subtitle">{t.compare.comment}</ThemedText>
              {priced
                .filter((o) => o.comment)
                .map((o) => (
                  <View key={o.id}>
                    <ThemedText type="smallBold">{o.supplierName}</ThemedText>
                    <ThemedText type="small">{o.comment}</ThemedText>
                  </View>
                ))}
            </Card>
          ) : null}

          {waiting.length ? (
            <Card>
              {waiting.map((o) => (
                <View key={o.id} style={styles.waiting}>
                  <ThemedText type="smallBold" style={{ flex: 1 }}>
                    {o.supplierName}
                  </ThemedText>
                  <Chip label={o.status === 'declined' ? t.compare.declined : t.compare.waiting} />
                  {o.status === 'invited' && o.remindedAt ? <Chip label={t.compare.reminded} tone="warn" /> : null}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Line({ label, strong, border, children }: { label: string; strong?: boolean; border: object; children: React.ReactNode }) {
  return (
    <View style={[styles.row, border]}>
      <View style={styles.label}>
        <ThemedText type={strong ? 'smallBold' : 'small'}>{label}</ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  label: { width: LABEL_WIDTH, paddingVertical: Spacing.two, paddingRight: Spacing.two, justifyContent: 'center' },
  cell: { width: OFFER_WIDTH, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, justifyContent: 'center' },
  headCell: { alignItems: 'flex-end', gap: Spacing.one },
  right: { textAlign: 'right' },
  tabular: { fontVariant: ['tabular-nums'] },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
