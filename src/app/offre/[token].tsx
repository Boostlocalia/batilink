import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n, type Language } from '@/i18n';
import { formatDate, formatEuro, parseAmount, parseBelgianDate, toBelgianDate } from '@/lib/format';
import { anonHeaders, functionsUrl } from '@/lib/supabase';

type Payload = {
  quote: {
    status: string;
    delivery_fee: number | null;
    lead_time_days: number | null;
    valid_until: string | null;
    comment: string | null;
    prices: Record<string, number>;
  };
  request: {
    title: string;
    postal_code: string;
    city: string | null;
    needed_by: string | null;
    reply_by: string;
    fulfilment: 'delivery' | 'pickup';
    note: string | null;
    status: string;
    company: { name: string; verified_at: string | null } | null;
  };
  items: { id: string; label: string; quantity: number; unit: string }[];
  supplier: { name: string; language: Language };
};

/** Public page opened from the supplier e-mail. No account needed. */
export default function SupplierQuoteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, locale, language, setLanguage } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error' | 'sent' | 'declined'>('loading');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [leadTime, setLeadTime] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${functionsUrl}/supplier-quote?token=${encodeURIComponent(token)}`, { headers: anonHeaders })
      .then(async (res) => {
        if (res.status === 404) return setState('invalid');
        if (!res.ok) return setState('error');
        const body = (await res.json()) as Payload;
        setData(body);
        setLanguage(body.supplier.language);
        setPrices(Object.fromEntries(Object.entries(body.quote.prices).map(([k, v]) => [k, String(v)])));
        if (body.quote.delivery_fee !== null) setDeliveryFee(String(body.quote.delivery_fee));
        if (body.quote.lead_time_days !== null) setLeadTime(String(body.quote.lead_time_days));
        if (body.quote.valid_until) setValidUntil(toBelgianDate(body.quote.valid_until));
        setComment(body.quote.comment ?? '');
        setState('ready');
      })
      .catch(() => setState('error'));
    // The supplier's language is applied once, on load; they can switch afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const post = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${functionsUrl}/supplier-quote`, {
        method: 'POST',
        headers: { ...anonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return true;
      if (json.error === 'closed') setError(t.supplier.closed);
      else if (json.error === 'missing_prices') setError(t.supplier.missingPrices);
      else if (json.error === 'invalid_terms') setError(t.supplier.invalidTerms);
      else if (json.error === 'invalid_link') setState('invalid');
      else setError(t.common.error);
      return false;
    } catch {
      setError(t.common.error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!data) return;
    const parsed = Object.fromEntries(data.items.map((i) => [i.id, parseAmount(prices[i.id] ?? '')]));
    if (Object.values(parsed).some((p) => p === null)) return setError(t.supplier.missingPrices);
    const fee = parseAmount(deliveryFee || '0');
    const days = Number(leadTime);
    if (fee === null || !leadTime.trim() || !Number.isInteger(days) || days < 0) return setError(t.supplier.invalidTerms);
    const valid = validUntil.trim() ? parseBelgianDate(validUntil) : null;
    if (validUntil.trim() && !valid) return setError(t.request.errors.date);
    if (await post({ prices: parsed, delivery_fee: fee, lead_time_days: days, valid_until: valid, comment })) setState('sent');
  };

  const decline = async () => {
    if (await post({ decline: true })) setState('declined');
  };

  const total =
    (data?.items.reduce((sum, i) => sum + (parseAmount(prices[i.id] ?? '') ?? 0) * Number(i.quantity), 0) ?? 0) +
    (parseAmount(deliveryFee || '0') ?? 0);

  const header = (
    <View style={styles.header}>
      <ThemedText type="subtitle" themeColor="brand">
        BatiLink
      </ThemedText>
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
    const message = {
      loading: t.common.loading,
      invalid: t.supplier.invalid,
      error: t.common.error,
      sent: t.supplier.thanks,
      declined: t.supplier.declinedThanks,
      ready: '',
    }[state];
    return (
      <Screen withTabBar={false}>
        {header}
        <Card>
          <ThemedText themeColor={state === 'sent' || state === 'declined' ? 'good' : state === 'loading' ? 'textSecondary' : 'danger'}>
            {message}
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const { request, items } = data;
  const open = request.status === 'sent' && ['invited', 'submitted'].includes(data.quote.status);
  const unitLabel = (u: string) => t.units[u as keyof typeof t.units] ?? u;

  return (
    <Screen withTabBar={false}>
      {header}
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="label" themeColor="textSecondary">
          {t.supplier.title} · {data.supplier.name}
        </ThemedText>
        <ThemedText type="title">{request.title}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t.supplier.from(request.company?.name ?? '')} · {request.postal_code} {request.city ?? ''}
        </ThemedText>
        <View style={styles.chips}>
          <Chip label={request.fulfilment === 'delivery' ? t.request.delivery : t.request.pickup} />
          {request.needed_by ? <Chip label={formatDate(request.needed_by, locale)} /> : null}
          <Chip label={t.supplier.replyBy(formatDate(request.reply_by, locale))} tone="warn" />
        </View>
        {request.note ? <ThemedText type="small">{request.note}</ThemedText> : null}
        <ThemedText type="small" themeColor="good">
          {t.supplier.noAccount}
        </ThemedText>
      </View>

      <Card>
        {items.map((item, index) => (
          <View key={item.id} style={[styles.item, index > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <ThemedText type="smallBold">{item.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {Number(item.quantity)} {unitLabel(item.unit)}
              </ThemedText>
            </View>
            <Field
              label={t.supplier.unitPrice}
              value={prices[item.id] ?? ''}
              onChangeText={(v) => setPrices((p) => ({ ...p, [item.id]: v }))}
              keyboardType="decimal-pad"
              editable={open}
              style={{ maxWidth: 160 }}
            />
          </View>
        ))}
        <View style={styles.wrap}>
          <Field label={t.supplier.deliveryFee} value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="decimal-pad" editable={open} />
          <Field label={t.supplier.leadTime} value={leadTime} onChangeText={setLeadTime} keyboardType="number-pad" editable={open} />
          <Field label={t.supplier.validUntil} value={validUntil} onChangeText={setValidUntil} placeholder="15/11/2026" editable={open} />
        </View>
        <Field label={t.supplier.comment} value={comment} onChangeText={setComment} multiline editable={open} style={{ minHeight: 70 }} />
        <View style={styles.total}>
          <ThemedText type="smallBold">{t.supplier.total}</ThemedText>
          <ThemedText type="subtitle" style={{ fontVariant: ['tabular-nums'] }}>
            {formatEuro(total, locale)}
          </ThemedText>
        </View>
        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
        {open ? (
          <>
            <Button
              label={data.quote.status === 'submitted' ? t.supplier.update : t.supplier.submit}
              variant="signal"
              onPress={submit}
              busy={busy}
            />
            {data.quote.status === 'invited' ? <Button label={t.supplier.decline} variant="ghost" small onPress={decline} /> : null}
          </>
        ) : (
          <ThemedText themeColor="textSecondary">{t.supplier.closed}</ThemedText>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  item: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: Spacing.two, paddingTop: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
