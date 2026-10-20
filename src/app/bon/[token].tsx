import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { LegalLinks } from '@/components/legal-links';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Option, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n, type Language } from '@/i18n';
import { formatDate, formatEuro, parseAmount } from '@/lib/format';
import { formatIban, normalizeIban, type OrderStatus } from '@/lib/orders';
import { anonHeaders, functionsUrl } from '@/lib/supabase';

type Payload = {
  order: {
    number: string;
    title: string;
    status: OrderStatus;
    total_ex_vat: number;
    vat: number;
    total_inc_vat: number;
    deposit_inc_vat: number;
    supplier_iban: string | null;
    deposit_rejected_reason: string | null;
    deposit_received_at: string | null;
    delivered_at: string | null;
    payment_reported_at: string | null;
  };
  request: { postal_code: string; city: string | null; needed_by: string | null; fulfilment: 'delivery' | 'pickup'; note: string | null } | null;
  items: { id: string; label: string; quantity: number; unit: string; unit_price: number }[];
  supplier: { name: string; language: Language } | null;
  contractor: { name: string; email: string | null } | null;
  documents: { id: string; kind: 'deposit_proof' | 'delivery_note' | 'payment_proof'; file_name: string; created_at: string; url: string | null }[];
};

const TONE = {
  awaiting_supplier: 'warn',
  awaiting_deposit: 'warn',
  deposit_proof_sent: 'warn',
  in_progress: 'brand',
  delivered: 'good',
  cancelled: 'neutral',
} as const;

/** Public page opened from the order e-mail. No account needed. */
export default function SupplierOrderScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, locale, language, setLanguage } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading');
  const [withDeposit, setWithDeposit] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [iban, setIban] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'decline' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const languageSet = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`${functionsUrl}/supplier-order?token=${encodeURIComponent(token)}`, { headers: anonHeaders }).catch(() => null);
    if (!res) return setState('error');
    if (res.status === 404) return setState('invalid');
    if (!res.ok) return setState('error');
    const body = (await res.json()) as Payload;
    // The page opens in the supplier's language; they can switch afterwards.
    if (body.supplier && !languageSet.current) {
      languageSet.current = true;
      setLanguage(body.supplier.language);
    }
    setData(body);
    setState('ready');
  }, [token, setLanguage]);

  // Reloads when the supplier comes back from Stripe.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const post = async (key: string, body: object) => {
    setBusy(key);
    setError(null);
    const res = await fetch(`${functionsUrl}/supplier-order`, {
      method: 'POST',
      headers: { ...anonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    }).catch(() => null);
    setBusy(null);
    const json = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    if (!res?.ok) {
      setError(json.error === 'invalid_iban' ? t.supplierOrder.invalidIban : json.error === 'invalid_deposit' ? t.supplierOrder.invalidDeposit : t.common.error);
      return;
    }
    setMode(null);
    setReason('');
    load();
  };

  const header = (
    <View style={styles.header}>
      <Logo size={24} />
      <Segmented<Language>
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'fr', label: 'FR' },
          { value: 'nl', label: 'NL' },
        ]}
      />
    </View>
  );

  if (state !== 'ready' || !data) {
    return (
      <Screen withTabBar={false}>
        {header}
        <Card>
          <ThemedText themeColor={state === 'loading' ? 'textSecondary' : 'danger'}>
            {state === 'loading' ? t.common.loading : state === 'invalid' ? t.supplierOrder.invalid : t.common.error}
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const { order, request, items, contractor } = data;
  const eur = (n: number) => formatEuro(Number(n), locale);
  const unitLabel = (u: string) => t.units[u as keyof typeof t.units] ?? u;
  const proofs = data.documents.filter((d) => d.kind === 'deposit_proof');
  const lastProof = proofs[proofs.length - 1];
  const paymentProofs = data.documents.filter((d) => d.kind === 'payment_proof');

  const confirm = () => {
    const amount = withDeposit ? parseAmount(deposit) : 0;
    if (amount === null || amount < 0 || amount > Number(order.total_inc_vat)) return setError(t.supplierOrder.invalidDeposit);
    if (iban.trim() && !normalizeIban(iban)) return setError(t.supplierOrder.invalidIban);
    post('confirm', { action: 'confirm', deposit_inc_vat: amount, iban: iban.trim() || undefined });
  };

  return (
    <Screen withTabBar={false}>
      {header}
      <View style={{ gap: Spacing.one }}>
        <View style={styles.wrap}>
          <Chip label={t.supplierOrder.status[order.status]} tone={TONE[order.status]} />
        </View>
        <ThemedText type="label" themeColor="textSecondary">
          {t.supplierOrder.title} · {data.supplier?.name}
        </ThemedText>
        <ThemedText type="title">
          {order.number} · {order.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{t.supplierOrder.lead(order.number, contractor?.name ?? '')}</ThemedText>
        {request ? (
          <ThemedText type="small">
            {request.fulfilment === 'delivery' ? t.supplierOrder.deliverTo(`${request.postal_code} ${request.city ?? ''}`.trim()) : t.supplierOrder.pickup}
            {request.needed_by ? ` · ${formatDate(request.needed_by, locale)}` : ''}
          </ThemedText>
        ) : null}
        {contractor?.email && order.status !== 'cancelled' ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplierOrder.contractor} : {contractor.name} · {contractor.email}
          </ThemedText>
        ) : null}
      </View>

      {error ? (
        <Card style={{ borderColor: theme.danger }}>
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        </Card>
      ) : null}

      <Card>
        <ThemedText type="subtitle">{t.supplierOrder.items}</ThemedText>
        {items.map((item, i) => (
          <View key={item.id} style={[styles.line, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <ThemedText type="smallBold">{item.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {Number(item.quantity)} {unitLabel(item.unit)} × {eur(item.unit_price)}
              </ThemedText>
            </View>
            <ThemedText type="small">{eur(Number(item.quantity) * Number(item.unit_price))}</ThemedText>
          </View>
        ))}
        <View style={[styles.line, { borderTopWidth: 1, borderTopColor: theme.line }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t.compare.totalExVat} · {t.compare.vat}
          </ThemedText>
          <ThemedText type="small">
            {eur(order.total_ex_vat)} · {eur(order.vat)}
          </ThemedText>
        </View>
        <View style={styles.line}>
          <ThemedText type="smallBold">{t.orders.total}</ThemedText>
          <ThemedText type="smallBold">{eur(order.total_inc_vat)}</ThemedText>
        </View>
      </Card>

      {order.status === 'awaiting_supplier' ? (
        <Card style={{ borderColor: theme.signal }}>
          <ThemedText type="subtitle">{t.supplierOrder.confirmTitle}</ThemedText>
          <ThemedText type="small">{t.supplierOrder.depositAsk}</ThemedText>
          <View style={styles.wrap}>
            <Option label={t.supplierOrder.noDeposit} selected={!withDeposit} onPress={() => setWithDeposit(false)} />
            <Option label={t.supplierOrder.withDeposit} selected={withDeposit} onPress={() => setWithDeposit(true)} />
          </View>
          {withDeposit ? (
            <View style={styles.fields}>
              <Field label={t.supplierOrder.depositAmount} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />
              <Field label={t.supplierOrder.iban} hint={t.supplierOrder.ibanHint} value={iban} onChangeText={setIban} autoCapitalize="characters" />
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplierOrder.invoiceRef(order.number)}
          </ThemedText>
          <View style={styles.wrap}>
            <Button label={t.supplierOrder.confirm} variant="signal" busy={busy === 'confirm'} onPress={confirm} />
            <Button label={t.supplierOrder.decline} variant="ghost" small onPress={() => setMode('decline')} />
          </View>
        </Card>
      ) : null}

      {order.status === 'awaiting_deposit' ? (
        <Card>
          <ThemedText>{t.supplierOrder.waitingDeposit(eur(order.deposit_inc_vat))}</ThemedText>
          {order.supplier_iban ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t.orders.transferTo(formatIban(order.supplier_iban), order.number)}
            </ThemedText>
          ) : null}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={t.supplierOrder.receivedNoProof} variant="ghost" small busy={busy === 'received'} onPress={() => post('received', { action: 'deposit_received' })} />
          </View>
        </Card>
      ) : null}

      {order.status === 'deposit_proof_sent' && lastProof ? (
        <Card style={{ borderColor: theme.signal }}>
          <ThemedText type="subtitle">{t.supplierOrder.proofTitle}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplierOrder.proofLead}
          </ThemedText>
          <ThemedText type="small">
            {lastProof.file_name} · {formatDate(lastProof.created_at.slice(0, 10), locale)} · {eur(order.deposit_inc_vat)}
          </ThemedText>
          {lastProof.url ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button label={t.supplierOrder.openProof} variant="ghost" small onPress={() => Linking.openURL(lastProof.url!)} />
            </View>
          ) : null}
          <View style={styles.wrap}>
            <Button label={t.supplierOrder.received} variant="signal" busy={busy === 'received'} onPress={() => post('received', { action: 'deposit_received' })} />
            <Button label={t.supplierOrder.notReceived} variant="ghost" small onPress={() => setMode('reject')} />
          </View>
        </Card>
      ) : null}

      {mode ? (
        <Card>
          <Field
            label={mode === 'decline' ? t.supplierOrder.declineReason : t.supplierOrder.rejectReason}
            value={reason}
            onChangeText={setReason}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <View style={styles.wrap}>
            <Button
              label={mode === 'decline' ? t.supplierOrder.declineConfirm : t.supplierOrder.rejectSend}
              busy={busy === mode}
              disabled={mode === 'reject' && !reason.trim()}
              onPress={() => post(mode, { action: mode === 'decline' ? 'decline' : 'deposit_rejected', reason })}
            />
            <Button label={t.common.cancel} variant="ghost" small onPress={() => setMode(null)} />
          </View>
        </Card>
      ) : null}

      {order.status === 'in_progress' ? (
        <Card>
          <ThemedText>{t.supplierOrder.inProgress}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplierOrder.invoiceRef(order.number)}
          </ThemedText>
        </Card>
      ) : null}

      {paymentProofs.length ? (
        <Card>
          <ThemedText type="subtitle">{t.supplierOrder.paymentProofTitle}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplierOrder.paymentProofLead}
          </ThemedText>
          {paymentProofs.map((d) => (
            <View key={d.id} style={styles.wrap}>
              <ThemedText type="small" style={{ flex: 1 }}>
                {d.file_name} · {formatDate(d.created_at.slice(0, 10), locale)}
              </ThemedText>
              {d.url ? <Button label={t.supplierOrder.openProof} variant="ghost" small onPress={() => Linking.openURL(d.url!)} /> : null}
            </View>
          ))}
        </Card>
      ) : null}
      <LegalLinks />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, flexWrap: 'wrap' },
  fields: { gap: Spacing.three },
});
