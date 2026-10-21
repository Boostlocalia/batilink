import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';

import { Questions, type Conversation, type QuoteMessage } from '@/components/questions';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import type { OrderStatus } from '@/lib/orders';
import { compareOffers, differs, linePrice, readFromPdf, type Offer, type RequestItem } from '@/lib/quotes';
import { supabase } from '@/lib/supabase';
import { NODI_FACE } from '@/constants/nodi';

type Request = {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'awarded';
  postal_code: string;
  city: string | null;
  supplier_choice: 'own' | 'batinode' | 'mix';
  relaunched_at: string | null;
  fulfilment: 'delivery' | 'pickup';
};

const LABEL_WIDTH = 190;

/** Nodi pointing up at the button of the best offer. */
function NodiPick({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.pick}>
      <ThemedText type="small" themeColor="signal">
        {label}
      </ThemedText>
      <ThemedText style={styles.pickHand}>☝️</ThemedText>
      <View style={[styles.pickFace, { borderColor: theme.signal }]}>
        <Image source={NODI_FACE} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="Nodi" />
      </View>
    </View>
  );
}

const OFFER_WIDTH = 168;

export default function CompareScreen() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [messages, setMessages] = useState<QuoteMessage[]>([]);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<{ id: string; number: string; status: OrderStatus } | null>(null);

  const load = useCallback(async () => {
    const [req, its, qs, msgs, po] = await Promise.all([
      supabase.from('price_requests').select('id, title, status, postal_code, city, supplier_choice, relaunched_at, fulfilment').eq('id', id).single(),
      supabase.from('request_items').select('id, label, quantity, unit').eq('request_id', id).order('position'),
      supabase
        .from('quotes')
        .select(
          'id, status, delivery_fee, lead_time_days, valid_until, comment, offer_file_path, reminded_at, correction_requested_at, supplier:companies(name), quote_items(item_id, unit_price, offered, mismatch, package_size, package_price, packages)',
        )
        .eq('request_id', id)
        .order('created_at'),
      supabase
        .from('quote_messages')
        .select('id, quote_id, author, body, relayed_body, item_labels, created_at')
        .eq('request_id', id)
        .not('relayed_at', 'is', null)
        .order('created_at'),
      supabase.from('purchase_orders').select('id, number, status').eq('request_id', id).maybeSingle(),
    ]);
    setOrder((po.data as { id: string; number: string; status: OrderStatus } | null) ?? null);
    if (req.error || its.error || qs.error || msgs.error) return setFailed(true);
    setMessages(msgs.data as QuoteMessage[]);
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
        offerFile: q.offer_file_path,
        correctionAsked: Boolean(q.correction_requested_at),
        prices: Object.fromEntries((q.quote_items ?? []).map((p) => [p.item_id, Number(p.unit_price)])),
        details: Object.fromEntries((q.quote_items ?? []).map((p) => [p.item_id, { offered: p.offered, mismatch: p.mismatch }])),
        packages: Object.fromEntries(
          (q.quote_items ?? [])
            .filter((p) => p.package_size && p.package_price !== null)
            .map((p) => [p.item_id, { size: p.package_size as string, price: Number(p.package_price), count: p.packages === null ? null : Number(p.packages) }]),
        ),
      })),
    );
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      // Clears the "new" count on the home tile.
      supabase.rpc('mark_request_seen', { rid: id }).then(() => undefined);
    }, [load, id]),
  );

  const award = async (quoteId: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('award-quote', { body: { quote_id: quoteId } });
    setBusy(false);
    setConfirming(null);
    if (error) return setFailed(true);
    // The award creates the purchase order: follow it from there.
    const orderId = (data as { order_id?: string } | null)?.order_id;
    if (orderId) return router.push(`/commande/${orderId}`);
    load();
  };

  const { priced, totals, cheapestId, fastestId, lowestLine, basis } = compareOffers(items, offers);
  const conversations: Conversation[] = offers
    .map((o) => ({ quoteId: o.id, supplierName: o.supplierName, messages: messages.filter((m) => m.quote_id === o.id) }))
    .filter((c) => c.messages.length > 0);
  // A supplier who sent their quote as a PDF has answered, even before the prices are typed in.
  const pdfOnly = offers.filter((o) => o.status === 'invited' && o.offerFile && !readFromPdf(o));
  const waiting = offers.filter((o) => (o.status === 'invited' && !o.offerFile) || o.status === 'declined');
  const eur = (n: number) => formatEuro(n, locale);
  const cell = (highlight: boolean) => [styles.cell, highlight && { backgroundColor: theme.goodBackground }];
  const rowBorder = { borderTopWidth: 1, borderTopColor: theme.line };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: request?.title ?? '' }} />
      {request && request.supplier_choice !== 'own' && request.status === 'sent' ? (
        <Card style={{ backgroundColor: theme.goodBackground, borderColor: theme.goodBackground }}>
          <ThemedText type="smallBold" themeColor="good">
            {request.relaunched_at ? t.request.relaunched(offers.length) : t.request.batinodeSearching(offers.length)}
          </ThemedText>
        </Card>
      ) : sent ? (
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
              {request.postal_code} {request.city ?? ''} · {t.compare.lead(priced.length + pdfOnly.length, offers.length)}
            </ThemedText>
          </View>

          {order ? (
            <Card style={{ borderColor: theme.signal }}>
              <View style={styles.orderRow}>
                <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                  <ThemedText type="subtitle">{t.orders.title(order.number)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.orders.status[order.status]}
                  </ThemedText>
                </View>
                <Button label={t.orders.follow} variant="signal" onPress={() => router.push(`/commande/${order.id}`)} />
              </View>
            </Card>
          ) : null}

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
                        {readFromPdf(o) ? <Chip label={t.compare.fromPdf} tone="neutral" /> : null}
                        {differs(o) ? <Chip label={t.compare.differs} tone="warn" /> : null}
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
                        const line = linePrice(item, o, basis);
                        const unitLabel = (unit: string) => t.units[unit as keyof typeof t.units] ?? unit;
                        const pack = o.packages?.[item.id];
                        return (
                          <View key={o.id} style={cell(line !== undefined && line === lowestLine[item.id])}>
                            {line === undefined ? (
                              <ThemedText type="number" themeColor="textSecondary" style={styles.right}>
                                –
                              </ThemedText>
                            ) : (
                              <>
                                <ThemedText type="number" style={styles.right}>
                                  {pack ? t.compare.perPackage(eur(pack.price), pack.size) : `${eur(o.prices[item.id])} / ${unitLabel(item.unit)}`}
                                </ThemedText>
                                {pack ? (
                                  <ThemedText type="small" themeColor="textSecondary" style={styles.right}>
                                    ≈ {eur(line / item.quantity)} / {unitLabel(item.unit)}
                                  </ThemedText>
                                ) : null}
                                {o.details?.[item.id]?.mismatch ? (
                                  <ThemedText type="small" themeColor="warn" style={styles.right} numberOfLines={2}>
                                    ⚠ {o.details[item.id].mismatch}
                                  </ThemedText>
                                ) : null}
                                {o.details?.[item.id]?.mismatch && o.correctionAsked ? (
                                  <ThemedText type="small" themeColor="textSecondary" style={styles.right} numberOfLines={2}>
                                    ↻ {t.compare.relaunched}
                                  </ThemedText>
                                ) : null}
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
                          {request.fulfilment === 'pickup'
                            ? t.compare.pickup
                            : o.deliveryFee === null
                              ? t.compare.deliveryUnknown
                              : o.deliveryFee === 0
                                ? t.common.free
                                : eur(o.deliveryFee)}
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
                          {readFromPdf(o) ? (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.right}>
                              {t.compare.fromPdfHint}
                            </ThemedText>
                          ) : confirming === o.id ? (
                            <>
                              <ThemedText type="small">{t.compare.confirm(o.supplierName)}</ThemedText>
                              <Button label={t.compare.choose} variant="signal" small busy={busy} onPress={() => award(o.id)} />
                              <Button label={t.common.cancel} variant="ghost" small onPress={() => setConfirming(null)} />
                            </>
                          ) : (
                            <Button label={t.compare.choose} variant="signal" small onPress={() => setConfirming(o.id)} />
                          )}
                          {o.id === cheapestId && confirming !== o.id ? <NodiPick label={t.compare.nodiPick} /> : null}
                        </View>
                      ))}
                    </Line>
                  ) : null}
                </View>
              </ScrollView>
              <ThemedText type="small" themeColor="textSecondary" style={{ paddingHorizontal: Spacing.three }}>
                {t.compare.unitBasis}
              </ThemedText>
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

          {offers.some((o) => o.offerFile && o.status !== 'declined') ? (
            <Card>
              <ThemedText type="subtitle">{t.compare.offerPdfs}</ThemedText>
              {offers
                .filter((o) => o.offerFile && o.status !== 'declined')
                .map((o) => (
                  <View key={o.id} style={styles.waiting}>
                    <ThemedText type="smallBold" style={{ flex: 1 }}>
                      {o.supplierName}
                    </ThemedText>
                    <Button small variant="ghost" label={t.compare.openPdf} onPress={() => openOfferPdf(o.offerFile!)} />
                  </View>
                ))}
            </Card>
          ) : null}

          <Questions conversations={conversations} canAnswer={request.status === 'sent' || request.status === 'awarded'} onSent={load} />

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
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  pickHand: { fontSize: 18, lineHeight: 22 },
  pickFace: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, overflow: 'hidden' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  label: { width: LABEL_WIDTH, paddingVertical: Spacing.two, paddingRight: Spacing.two, justifyContent: 'center' },
  cell: { width: OFFER_WIDTH, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, justifyContent: 'center' },
  headCell: { alignItems: 'flex-end', gap: Spacing.one },
  right: { textAlign: 'right' },
  tabular: { fontVariant: ['tabular-nums'] },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});

/** Opens a supplier's PDF quote through a link valid five minutes. */
async function openOfferPdf(path: string): Promise<void> {
  const { data } = await supabase.storage.from('quote-files').createSignedUrl(path, 300);
  if (!data?.signedUrl) return;
  if (Platform.OS === 'web') window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  else await WebBrowser.openBrowserAsync(data.signedUrl);
}
