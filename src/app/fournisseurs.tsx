import { FunctionsHttpError } from '@supabase/supabase-js';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { isEmail } from '@/lib/signup';
import { supabase } from '@/lib/supabase';

type Favourite = { supplier_id: string; supplier: { name: string; city: string | null; vat_number: string | null } | null };
type Nearby = { id: string; name: string; city: string | null; verified: boolean; in_region: boolean; favourite: boolean };

/** Accents and case do not matter when searching a name. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A contractor's usual suppliers: offered on every request, picked from the suppliers nearby or added by name. */
export default function FavouriteSuppliersScreen() {
  const { t } = useI18n();
  const f = t.growth.favourites;
  const theme = useTheme();
  const [list, setList] = useState<Favourite[] | null>(null);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: around }] = await Promise.all([
      supabase
        .from('preferred_suppliers')
        .select('supplier_id, supplier:companies!preferred_suppliers_supplier_id_fkey(name, city, vat_number)')
        .order('created_at', { ascending: false }),
      supabase.rpc('nearby_suppliers'),
    ]);
    setList((data as unknown as Favourite[] | null) ?? []);
    setNearby((around as Nearby[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const chosen = useMemo(() => new Set((list ?? []).map((fav) => fav.supplier_id)), [list]);
  const matches = useMemo(() => {
    const q = fold(query.trim());
    return (nearby ?? []).filter((s) => !q || fold(`${s.name} ${s.city ?? ''}`).includes(q));
  }, [nearby, query]);

  const failure = async (error: unknown) => {
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    const code = body?.error as keyof typeof f.errors | undefined;
    return code && f.errors[code] ? f.errors[code] : t.common.error;
  };

  const pick = async (s: Nearby) => {
    if (chosen.has(s.id)) return;
    setPicking(s.id);
    setNotice(null);
    setErrors({});
    const { error } = await supabase.functions.invoke('invite-supplier', { body: { supplier_id: s.id } });
    setPicking(null);
    if (error) return setErrors({ pick: await failure(error) });
    setNotice(f.added(s.name));
    setOpen(false);
    setQuery('');
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
    const { data, error } = await supabase.functions.invoke('invite-supplier', {
      body: { name: name.trim(), city: city.trim(), email: email.trim() },
    });
    setBusy(false);
    if (error) return setErrors({ form: await failure(error) });
    const n = name.trim();
    setNotice((data as { invited?: boolean })?.invited ? f.invited(n) : email.trim() ? f.added(n) : f.requested(n));
    setName('');
    setCity('');
    setEmail('');
    load();
  };

  const remove = async (supplierId: string) => {
    await supabase.functions.invoke('invite-supplier', { body: { remove: supplierId } });
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
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">{f.pick}</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderWidth: 1,
              borderRadius: 8,
              borderColor: open ? theme.brand : theme.line,
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}>
            <ThemedText themeColor="textSecondary">{f.pickHint}</ThemedText>
            <ThemedText themeColor="textSecondary">{open ? '▴' : '▾'}</ThemedText>
          </Pressable>
        </View>
        {open ? (
          <View style={{ gap: Spacing.two }}>
            <Field label={f.search} value={query} onChangeText={setQuery} autoFocus />
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 320, borderWidth: 1, borderColor: theme.line, borderRadius: 8 }}>
              {nearby === null ? (
                <ThemedText themeColor="textSecondary" style={{ padding: 12 }}>
                  {t.common.loading}
                </ThemedText>
              ) : matches.length === 0 ? (
                <ThemedText themeColor="textSecondary" style={{ padding: 12 }}>
                  {f.noMatch}
                </ThemedText>
              ) : (
                matches.map((s, i) => {
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
                })
              )}
            </ScrollView>
            {errors.pick ? <ThemedText themeColor="danger">{errors.pick}</ThemedText> : null}
          </View>
        ) : null}
      </Card>
      <Card>
        <ThemedText type="smallBold">{f.notListed}</ThemedText>
        <Field label={f.name} value={name} onChangeText={setName} error={errors.name} />
        <Field label={f.city} value={city} onChangeText={setCity} />
        <Field
          label={f.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
          hint={f.emailHint}
          onSubmitEditing={add}
        />
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
}
