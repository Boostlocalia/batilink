import { useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { isBelgianPostalCode, isBelgianVat, normalizeVat } from '@/lib/format';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** First sign-in: a contractor or an architect creates their company, which is then checked. */
export default function CompanyScreen() {
  const { t, language } = useI18n();
  const { refresh } = useSession();
  const [kind, setKind] = useState<'contractor' | 'architect'>('contractor');
  const [name, setName] = useState('');
  const [vat, setVat] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = t.request.errors.name;
    if (!isBelgianVat(vat)) next.vat = t.onboarding.invalidVat;
    if (!isBelgianPostalCode(postalCode)) next.postalCode = t.onboarding.invalidPostal;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const { error } = await supabase.rpc('create_company', {
      p_kind: kind,
      p_name: name.trim(),
      p_vat: normalizeVat(vat),
      p_postal_code: postalCode.trim(),
      p_city: city.trim(),
      p_language: language,
    });
    if (error) {
      setBusy(false);
      return setErrors({ form: t.common.error });
    }
    // Checks VAT, BCE/KBO and 30bis; the result shows in Réglages.
    await supabase.functions.invoke('verify-company', { body: {} }).catch(() => undefined);
    setBusy(false);
    await refresh();
  };

  return (
    <Screen withTabBar={false}>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{t.onboarding.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{kind === 'architect' ? t.onboarding.architectLead : t.onboarding.lead}</ThemedText>
      </View>
      <Card>
        <ThemedText type="smallBold">{t.onboarding.kind}</ThemedText>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'contractor', label: t.onboarding.kinds.contractor },
            { value: 'architect', label: t.onboarding.kinds.architect },
          ]}
        />
        <Field label={t.onboarding.name} value={name} onChangeText={setName} error={errors.name} />
        <Field
          label={t.onboarding.vat}
          value={vat}
          onChangeText={setVat}
          autoCapitalize="characters"
          hint={t.onboarding.vatHint}
          error={errors.vat}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
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
        {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
        <Button label={t.onboarding.create} variant="signal" onPress={create} busy={busy} />
      </Card>
    </Screen>
  );
}
