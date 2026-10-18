import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Option, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { isBelgianPostalCode, parseAmount, parseBelgianDate } from '@/lib/format';
import { loadTrades, type Trade } from '@/lib/network';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** A contractor posts work to subcontract; an architect posts a project. */
export default function NewPostScreen() {
  const { t, language } = useI18n();
  const { company } = useSession();
  const architect = company?.kind === 'architect';
  const [trades, setTrades] = useState<Trade[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [postalCode, setPostalCode] = useState(company?.postal_code ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [startsOn, setStartsOn] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadTrades().then(setTrades);
  }, []);

  const toggle = (id: number) =>
    setTradeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 6 ? [...ids, id] : ids));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = t.network.form.errors.title;
    if (description.trim().length < 11) next.description = t.network.form.errors.description;
    if (!tradeIds.length) next.trades = t.network.form.errors.trades;
    if (!isBelgianPostalCode(postalCode)) next.postalCode = t.onboarding.invalidPostal;
    const start = startsOn.trim() ? parseBelgianDate(startsOn) : null;
    if (startsOn.trim() && !start) next.startsOn = t.request.errors.date;
    const amount = budget.trim() ? parseAmount(budget) : null;
    if (budget.trim() && amount === null) next.budget = t.supplier.invalidTerms;
    setErrors(next);
    if (Object.keys(next).length || !company) return;

    setBusy(true);
    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        company_id: company.id,
        kind: architect ? 'architect_project' : 'subcontract',
        title: title.trim(),
        description: description.trim(),
        trade_ids: tradeIds,
        postal_code: postalCode.trim(),
        city: city.trim() || null,
        starts_on: start,
        budget_ex_vat: amount,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error || !data) return setErrors({ form: t.common.error });
    router.replace(`/annonce/${data.id}`);
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: architect ? t.network.publishProject : t.network.publish }} />
      <Card>
        <Field label={t.network.form.title} placeholder={t.network.form.titlePlaceholder} value={title} onChangeText={setTitle} error={errors.title} />
        <Field
          label={t.network.form.description}
          placeholder={t.network.form.descriptionPlaceholder}
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 110, textAlignVertical: 'top' }}
          error={errors.description}
        />
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">{t.network.form.trades}</ThemedText>
          <View style={styles.wrap}>
            {trades.map((trade) => (
              <Option
                key={trade.id}
                label={language === 'fr' ? trade.label_fr : trade.label_nl}
                selected={tradeIds.includes(trade.id)}
                onPress={() => toggle(trade.id)}
              />
            ))}
          </View>
          {errors.trades ? (
            <ThemedText type="small" themeColor="danger">
              {errors.trades}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.wrap}>
          <Field
            label={t.onboarding.postalCode}
            value={postalCode}
            onChangeText={setPostalCode}
            keyboardType="number-pad"
            maxLength={4}
            error={errors.postalCode}
          />
          <Field label={t.onboarding.city} value={city} onChangeText={setCity} />
        </View>
        <View style={styles.wrap}>
          <Field label={t.network.form.startsOn} value={startsOn} onChangeText={setStartsOn} placeholder="02/11/2026" error={errors.startsOn} />
          <Field label={t.network.form.budget} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" error={errors.budget} />
        </View>
        {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
        <Button label={t.network.form.submit} variant="signal" busy={busy} onPress={submit} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
