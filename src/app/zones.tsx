import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Option, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { REGIONS, type Region } from '@/lib/signup';
import { supabase } from '@/lib/supabase';

type Item = { id: number; label_fr: string; label_nl: string };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** A supplier picks the categories it sells and the provinces it serves. */
export default function ZonesScreen() {
  const { t, language } = useI18n();
  const s = t.growth.supplierSpace;
  const [categories, setCategories] = useState<Item[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from('categories').select('id, label_fr, label_nl').order('id').then(({ data }) => setCategories(data ?? []));
    supabase.rpc('my_company_profile').then(({ data }) => {
      const p = data as { regions?: Region[]; categories?: number[] } | null;
      setRegions(p?.regions ?? []);
      setPicked(p?.categories ?? []);
    });
  }, []);

  const save = async () => {
    if (picked.length === 0) return setMessage({ ok: false, text: t.signup.errors.categories });
    if (regions.length === 0) return setMessage({ ok: false, text: t.signup.errors.regions });
    setBusy(true);
    const { error } = await supabase.rpc('set_supplier_coverage', { p_categories: picked, p_regions: regions });
    setBusy(false);
    setMessage(error ? { ok: false, text: t.common.error } : { ok: true, text: s.saved });
  };

  return (
    <Screen withTabBar={false}>
      <Stack.Screen options={{ title: s.zones }} />
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="title">{s.zones}</ThemedText>
        <ThemedText themeColor="textSecondary">{s.zonesLead}</ThemedText>
      </View>
      <Card>
        <ThemedText type="smallBold">{t.signup.categories}</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {categories.map((c) => (
            <Option key={c.id} label={language === 'nl' ? c.label_nl : c.label_fr} selected={picked.includes(c.id)} onPress={() => setPicked(toggle(picked, c.id))} />
          ))}
        </View>
        <ThemedText type="smallBold">{t.signup.supplierRegions}</ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
          {REGIONS.map((r) => (
            <Option key={r} label={t.signup.regionLabels[r]} selected={regions.includes(r)} onPress={() => setRegions(toggle(regions, r))} />
          ))}
        </View>
        {message ? <ThemedText themeColor={message.ok ? 'good' : 'danger'}>{message.text}</ThemedText> : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Button label={s.saveZones} variant="signal" onPress={save} busy={busy} />
        </View>
      </Card>
    </Screen>
  );
}
