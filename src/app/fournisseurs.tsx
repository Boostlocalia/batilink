import { FunctionsHttpError } from '@supabase/supabase-js';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { isEmail } from '@/lib/signup';
import { supabase } from '@/lib/supabase';

type Favourite = { supplier_id: string; supplier: { name: string; city: string | null; vat_number: string | null } | null };
type Suggestion = { id: string; name: string; city: string | null; connected: boolean; in_region: boolean };

const MAX_SUGGESTIONS = 8;

/** Accents and case do not matter when searching a name. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A contractor's usual suppliers: picked from the suggestions while typing, or added with their details. */
export default function FavouriteSuppliersScreen() {
  const { t } = useI18n();
  const f = t.growth.favourites;
  const theme = useTheme();
  const [list, setList] = useState<Favourite[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: around }] = await Promise.all([
      supabase
        .from('preferred_suppliers')
        .select('supplier_id, supplier:companies!preferred_suppliers_supplier_id_fkey(name, city, vat_number)')
        .order('created_at', { ascending: false }),
      supabase.rpc('suggest_suppliers'),
    ]);
    setList((data as unknown as Favourite[] | null) ?? []);
    setSuggestions((around as Suggestion[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const chosen = useMemo(() => new Set((list ?? []).map((fav) => fav.supplier_id)), [list]);
  // While typing, the suppliers whose name or town contains the text; before, the closest ones.
  const matches = useMemo(() => {
    const q = fold(name.trim());
    return suggestions.filter((s) => !q || fold(`${s.name} ${s.city ?? ''}`).includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [suggestions, name]);
  const showSuggestions = (focused || name.trim().length > 0) && matches.length > 0;

  const failure = async (error: unknown) => {
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    const code = body?.error as keyof typeof f.errors | undefined;
    return code && f.errors[code] ? f.errors[code] : t.common.error;
  };

  const reset = () => {
    setName('');
    setCity('');
    setEmail('');
    setPhone('');
    setFocused(false);
  };

  const pick = async (s: Suggestion) => {
    if (chosen.has(s.id)) return;
    setPicking(s.id);
    setNotice(null);
    setErrors({});
    const { error } = await supabase.functions.invoke('invite-supplier', { body: { supplier_id: s.id } });
    setPicking(null);
    if (error) return setErrors({ form: await failure(error) });
    setNotice(f.added(s.name));
    reset();
    load();
  };

  const add = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = f.errors.invalid_name;
    if (email.trim() && !isEmail(email)) e.email = f.errors.invalid_email;
    setErrors(e);
    setNotice(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke('invite-supplier', {
      body: { name: name.trim(), city: city.trim(), email: email.trim(), phone: phone.trim() },
    });
    setBusy(false);
    if (error) return setErrors({ form: await failure(error) });
    setNotice(f.requested(name.trim()));
    reset();
    load();
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: f.title }} />
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{f.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{f.lead}</ThemedText>
      </View>
      {notice ? <ThemedText themeColor="good">{notice}</ThemedText> : null}
      <Card>
        <View style={{ gap: 0 }}>
          <Field
            label={f.name}
            value={name}
            onChangeText={setName}
            placeholder={f.namePlaceholder}
            onFocus={() => setFocused(true)}
            autoCorrect={false}
            error={errors.name}
          />
          {showSuggestions ? (
            <View style={{ borderWidth: 1, borderColor: theme.line, borderRadius: 8, marginTop: Spacing.one, overflow: 'hidden' }}>
              {matches.map((s, i) => {
                const added = chosen.has(s.id);
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: added || picking !== null }}
                    disabled={added || picking !== null}
                    onPress={() => pick(s)}
                    style={({ pressed }) => [
                      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, padding: 12 },
                      i > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
                      (pressed || picking === s.id) && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <View style={{ flexShrink: 1, gap: Spacing.half }}>
                      <ThemedText type="smallBold" themeColor={added ? 'textSecondary' : 'text'}>
                        {s.name}
                      </ThemedText>
                      {s.city ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {s.city}
                        </ThemedText>
                      ) : null}
                    </View>
                    {added ? <Chip label={f.chosen} tone="good" /> : s.in_region ? <Chip label={f.inRegion} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {f.notListed}
        </ThemedText>
        <Field label={f.city} value={city} onChangeText={setCity} />
        <Field
          label={f.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
          hint={f.emailHint}
        />
        <Field label={f.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" onSubmitEditing={add} />
        {errors.form ? <ThemedText themeColor="danger">{errors.form}</ThemedText> : null}
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

  async function remove(supplierId: string) {
    await supabase.functions.invoke('invite-supplier', { body: { remove: supplierId } });
    load();
  }
}
