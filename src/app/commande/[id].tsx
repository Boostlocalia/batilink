import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatDate, formatEuro } from '@/lib/format';
import { formatIban, ORDER_DOCUMENT_COLUMNS, pickAndUpload, type DocumentKind, type OrderDocument, type OrderStatus } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import { NotMineCard } from '@/components/not-mine-card';

type Order = {
  id: string;
  number: string;
  title: string;
  status: OrderStatus;
  total_ex_vat: number;
  vat: number;
  total_inc_vat: number;
  created_at: string;
  supplier_confirmed_at: string | null;
  deposit_inc_vat: number;
  supplier_iban: string | null;
  deposit_proof_sent_at: string | null;
  deposit_received_at: string | null;
  deposit_rejected_reason: string | null;
  delivered_at: string | null;
  payment_reported_at: string | null;
  cancel_reason: string | null;
  store_address: string | null;
  in_stock: boolean | null;
  ready_at: string | null;
  supplier: { name: string } | null;
};

/** The supplier's store, readable only by the client of the order (order_supplier_contact). */
type Store = { name: string; address: string | null; phone: string | null };

const mapsUrl = (name: string, address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;

const STATUS_TONE = {
  awaiting_supplier: 'warn',
  awaiting_deposit: 'warn',
  deposit_proof_sent: 'warn',
  in_progress: 'brand',
  delivered: 'good',
  cancelled: 'neutral',
} as const;

const CHECK_TONE = { matched: 'good', mismatch: 'neutral', manual_review: 'warn' } as const;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [docs, setDocs] = useState<OrderDocument[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [failed, setFailed] = useState(false);
  const [notMine, setNotMine] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'good' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    const [o, d, c] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select(
          'id, number, title, status, total_ex_vat, vat, total_inc_vat, created_at, supplier_confirmed_at, deposit_inc_vat, supplier_iban, deposit_proof_sent_at, deposit_received_at, deposit_rejected_reason, delivered_at, payment_reported_at, cancel_reason, store_address, in_stock, ready_at, supplier:companies!purchase_orders_supplier_id_fkey(name)',
        )
        .eq('id', id)
        .single(),
      supabase.from('order_documents').select(ORDER_DOCUMENT_COLUMNS).eq('order_id', id).order('created_at'),
      supabase.rpc('order_supplier_contact', { p_order: id }),
    ]);
    setNotMine(o.error?.code === 'PGRST116');
    if (o.error) return setFailed(true);
    setFailed(false);
    setOrder(o.data as unknown as Order);
    setDocs((d.data ?? []) as OrderDocument[]);
    setStore((c.data as Store | null) ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const eur = (n: number) => formatEuro(Number(n), locale);
  const date = (iso: string) => formatDate(iso.slice(0, 10), locale);

  const act = async (key: string, body: object) => {
    setBusy(key);
    setNotice(null);
    const { error } = await supabase.functions.invoke('order-action', { body: { order_id: id, ...body } });
    setBusy(null);
    if (error) return setNotice({ text: t.common.error, tone: 'danger' });
    load();
  };

  const upload = async (kind: DocumentKind) => {
    setBusy(kind);
    setNotice(null);
    const result = await pickAndUpload(id, kind);
    setBusy(null);
    if (!result) return;
    if (!result.ok) return setNotice({ text: t.orders.uploadErrors[result.error] ?? t.common.error, tone: 'danger' });
    if (kind === 'deposit_proof' || kind === 'payment_proof') setNotice({ text: t.orders.proofSent, tone: 'good' });
    load();
  };

  if (failed)
    return (
      <Screen withTabBar={false}>
        {notMine ? (
          <NotMineCard path={`/commande/${id}`} />
        ) : (
          <Card>
            <ThemedText themeColor="danger">{t.common.error}</ThemedText>
            <Button label={t.common.retry} variant="ghost" small onPress={load} />
          </Card>
        )}
      </Screen>
    );
  if (!order)
    return (
      <Screen withTabBar={false}>
        <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
      </Screen>
    );

  const invoice = [...docs].reverse().find((d) => d.kind === 'invoice');
  const waitingDeposit = order.status === 'awaiting_deposit' || order.status === 'deposit_proof_sent';
  const started = order.status === 'in_progress' || order.status === 'delivered';

  const steps: [string, string | null][] = [
    [t.orders.steps.ordered, order.created_at],
    [t.orders.steps.confirmed, order.supplier_confirmed_at],
    ...(order.in_stock === false ? ([[t.orders.steps.inStock, order.ready_at]] as [string, string | null][]) : []),
    ...(Number(order.deposit_inc_vat) > 0 ? ([[t.orders.steps.deposit, order.deposit_received_at]] as [string, string | null][]) : []),
    [t.orders.steps.delivered, order.delivered_at],
    [t.orders.steps.paid, order.payment_reported_at],
    [t.orders.steps.invoice, invoice?.check_status === 'matched' ? invoice.created_at : null],
  ];

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: order.number }} />
      <View style={{ gap: Spacing.one }}>
        <View style={styles.wrap}>
          <Chip label={t.orders.status[order.status]} tone={STATUS_TONE[order.status]} />
        </View>
        <ThemedText type="title">{t.orders.title(order.number)}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {order.title} · {t.orders.supplier} : {order.supplier?.name}
        </ThemedText>
      </View>

      {notice ? (
        <Card style={{ borderColor: notice.tone === 'good' ? theme.good : theme.danger }}>
          <ThemedText type="small" themeColor={notice.tone}>
            {notice.text}
          </ThemedText>
        </Card>
      ) : null}

      {order.status === 'cancelled' ? (
        <Card>
          <ThemedText>{t.orders.cancelled(order.cancel_reason)}</ThemedText>
        </Card>
      ) : (
        <Card>
          {steps.map(([label, at]) => (
            <View key={label} style={styles.step}>
              <View style={[styles.dot, { backgroundColor: at ? theme.signal : 'transparent', borderColor: at ? theme.signal : theme.line }]} />
              <ThemedText type="smallBold" themeColor={at ? 'text' : 'textSecondary'} style={{ flex: 1 }}>
                {label}
              </ThemedText>
              {at ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {date(at)}
                </ThemedText>
              ) : null}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {t.orders.proofNote}
          </ThemedText>
        </Card>
      )}

      {order.supplier_confirmed_at && order.status !== 'cancelled' && store ? (
        <Card>
          <ThemedText type="subtitle">{t.orders.storeTitle}</ThemedText>
          <ThemedText type="smallBold" themeColor={order.ready_at ? 'good' : 'warn'}>
            {order.ready_at ? t.orders.stockReady : t.orders.stockOrdered}
          </ThemedText>
          <ThemedText>{store.name}</ThemedText>
          {store.address ? <ThemedText type="small">{store.address}</ThemedText> : null}
          {store.phone ? (
            <ThemedText type="small" themeColor="textSecondary">
              {store.phone}
            </ThemedText>
          ) : null}
          <View style={styles.wrap}>
            {store.address ? <Button label={t.orders.route} variant="signal" small onPress={() => Linking.openURL(mapsUrl(store.name, store.address!))} /> : null}
            {store.phone ? <Button label={t.orders.call} variant="ghost" small onPress={() => Linking.openURL(`tel:${store.phone!.replace(/[^+\d]/g, '')}`)} /> : null}
          </View>
        </Card>
      ) : null}

      {order.status === 'awaiting_supplier' ? (
        <View style={{ alignSelf: 'flex-start', gap: Spacing.one }}>
          <Button label={t.orders.cancel} variant="ghost" small busy={busy === 'cancel'} onPress={() => act('cancel', { action: 'cancel' })} />
          <ThemedText type="small" themeColor="textSecondary">
            {t.orders.cancelHint}
          </ThemedText>
        </View>
      ) : null}

      {waitingDeposit ? (
        <Card style={{ borderColor: theme.signal }}>
          <ThemedText type="subtitle">{t.orders.depositTitle}</ThemedText>
          <ThemedText>{t.orders.depositLead(eur(order.deposit_inc_vat))}</ThemedText>
          {order.deposit_rejected_reason ? (
            <ThemedText type="small" themeColor="danger">
              {t.orders.proofRejected(order.deposit_rejected_reason)}
            </ThemedText>
          ) : null}
          {order.supplier_iban ? <ThemedText type="smallBold">{t.orders.transferTo(formatIban(order.supplier_iban), order.number)}</ThemedText> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {t.orders.proofLead}
          </ThemedText>
          {order.status === 'deposit_proof_sent' ? (
            <ThemedText type="small" themeColor="good">
              {t.orders.proofSent}
            </ThemedText>
          ) : null}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              label={order.status === 'deposit_proof_sent' ? t.orders.sendAnotherProof : t.orders.sendProof}
              variant="signal"
              busy={busy === 'deposit_proof'}
              onPress={() => upload('deposit_proof')}
            />
          </View>
        </Card>
      ) : null}

      {order.deposit_received_at ? (
        <ThemedText type="small" themeColor="good">
          {t.orders.depositOk}
        </ThemedText>
      ) : null}

      {started ? (
        <View style={styles.grid}>
          <Card style={styles.cell}>
            <ThemedText type="subtitle">{t.orders.deliveryTitle}</ThemedText>
            {order.delivered_at ? (
              <ThemedText themeColor="good">{t.orders.deliveredOn(date(order.delivered_at))}</ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.orders.deliveredAsk}
                </ThemedText>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Button label={t.orders.confirmDelivery} variant="signal" busy={busy === 'delivered'} onPress={() => act('delivered', { action: 'delivered' })} />
                </View>
              </>
            )}
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label={t.orders.addDeliveryNote} variant="ghost" small busy={busy === 'delivery_note'} onPress={() => upload('delivery_note')} />
            </View>
          </Card>

          <Card style={styles.cell}>
            <ThemedText type="subtitle">{t.orders.invoiceTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t.orders.invoiceLead}
            </ThemedText>
            {invoice?.check_status ? (
              <View style={{ gap: Spacing.one }}>
                <Chip label={t.orders.invoiceCheck[invoice.check_status]} tone={CHECK_TONE[invoice.check_status]} />
                {invoice.findings.map((f) => (
                  <ThemedText key={f} type="small" themeColor="textSecondary">
                    • {t.orders.findings[f] ?? f}
                  </ThemedText>
                ))}
              </View>
            ) : null}
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label={t.orders.sendInvoice} variant={invoice ? 'ghost' : 'primary'} small busy={busy === 'invoice'} onPress={() => upload('invoice')} />
            </View>
          </Card>
        </View>
      ) : null}

      {order.status !== 'cancelled' ? (
        <Card>
          <ThemedText type="subtitle">{t.orders.paymentTitle}</ThemedText>
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.compare.totalExVat}
            </ThemedText>
            <ThemedText type="small">{eur(order.total_ex_vat)}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              {t.compare.vat}
            </ThemedText>
            <ThemedText type="small">{eur(order.vat)}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText type="smallBold">{t.orders.total}</ThemedText>
            <ThemedText type="smallBold">{eur(order.total_inc_vat)}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t.orders.payDirect}
          </ThemedText>
          {order.payment_reported_at ? (
            <ThemedText type="small" themeColor="good">
              {t.orders.paymentReported(date(order.payment_reported_at))}
            </ThemedText>
          ) : null}
          {started ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button
                label={order.payment_reported_at ? t.orders.sendAnotherProof : t.orders.sendPaymentProof}
                variant={order.payment_reported_at ? 'ghost' : 'primary'}
                small
                busy={busy === 'payment_proof'}
                onPress={() => upload('payment_proof')}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {docs.length ? (
        <Card>
          <ThemedText type="subtitle">{t.orders.documents}</ThemedText>
          {docs.map((d) => (
            <View key={d.id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <ThemedText type="smallBold">{t.orders.docKinds[d.kind]}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {d.file_name} · {date(d.created_at)}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {t.orders.fingerprint(d.sha256)}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  // Side by side on tablets and laptops.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  cell: { flexGrow: 1, flexBasis: 320, minWidth: 260 },
});
