import { FunctionsHttpError } from '@supabase/supabase-js';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { isEmail } from '@/lib/signup';
import { supabase } from '@/lib/supabase';

type Favourite = { supplier_id: string; supplier: { name: string; city: string | null; vat_number: string | null } | null };

/** A contractor's usual suppliers: offered on every request, invited if not yet on the platform. */
export default function FavouriteSuppliersScreen() {
  const { t } = useI18n();
  const f = t.growth.favourites;
  const theme = useTheme();
  const [list, setList] = useState<Favourite[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('preferred_suppliers')
      .select('supplier_id, supplier:companies!preferred_suppliers_supplier_id_fkey(name, city, vat_number)')
      .order('created_at', { ascending: false });
    setList((data as unknown as Favourite[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const add = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = f.errors.invalid_name;
    if (!isEmail(email)) e.email = f.errors.invalid_email;
    setErrors(e);
    setNotice(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('invite-supplier', { body: { name: name.trim(), email: email.trim() } });
    setBusy(false);
    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      const code = body?.error as keyof typeof f.errors | undefined;
      return setErrors({ form: code && f.errors[code] ? f.errors[code] : t.common.error });
    }
    setNotice((data as { invited?: boolean })?.invited ? f.invited(name.trim()) : f.added(name.trim()));
    setName('');
    setEmail('');
    load();
  };

  const remove = async (supplierId: string) => {
    await supabase.functions.invoke('invite-supplier', { method: 'DELETE', body: { supplier_id: supplierId } });
    load();
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: f.title }} />
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{f.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{f.lead}</ThemedText>
      </View>
      <Card>
        <Field label={f.name} value={name} onChangeText={setName} error={errors.name} />
        <Field
          label={f.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
          onSubmitEditing={add}
        />
        {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
        {notice ? <ThemedText themeColor="good">{notice}</ThemedText> : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={f.add} variant="signal" onPress={add} busy={busy} />
        </View>
      </Card>
      <Card>
        {list === null ? (
          <ThemedText themeColor="textSecondary">{t.common.loading}</ThemedText>
        ) : list.length === 0 ? (
          <ThemedText themeColor="textSecondary">{f.empty}</ThemedText>
        ) : (
          list.map((fav, i) => (
            <View
              key={fav.supplier_id}
              style={[
                { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: Spacing.two },
                i > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
              ]}>
              <View style={{ gap: Spacing.half, flexShrink: 1 }}>
                <ThemedText type="smallBold">{fav.supplier?.name}</ThemedText>
                <Chip label={fav.supplier?.vat_number ? f.member : f.pending} tone={fav.supplier?.vat_number ? 'good' : 'neutral'} />
              </View>
              <Button label={f.remove} variant="ghost" small onPress={() => remove(fav.supplier_id)} />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
