import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

const HIDDEN_KEY = 'batilink.start-hidden';

type Step = { key: 'profile' | 'suppliers' | 'request' | 'award' | 'invite'; done: boolean; href: Href };

/** A contractor's first steps, each one a tap away, until they are all done. */
export function StartChecklist() {
  const { t } = useI18n();
  const s = t.growth.start;
  const theme = useTheme();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(true);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(HIDDEN_KEY)
        .then((v) => setHidden(v === '1'))
        .catch(() => setHidden(false));
      Promise.all([
        supabase.from('preferred_suppliers').select('supplier_id', { count: 'exact', head: true }),
        supabase.from('price_requests').select('id', { count: 'exact', head: true }).neq('status', 'draft'),
        supabase.from('price_requests').select('id', { count: 'exact', head: true }).eq('status', 'awarded'),
        supabase.rpc('my_referrals'),
      ]).then(([fav, sent, awarded, refs]) => {
        setSteps([
          { key: 'profile', done: true, href: '/reglages' },
          { key: 'suppliers', done: (fav.count ?? 0) > 0, href: '/fournisseurs' },
          { key: 'request', done: (sent.count ?? 0) > 0, href: '/nouvelle' },
          { key: 'award', done: (awarded.count ?? 0) > 0, href: '/' },
          { key: 'invite', done: ((refs.data as unknown[] | null) ?? []).length > 0, href: '/reglages' },
        ]);
      });
    }, []),
  );

  if (!steps || hidden) return null;
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    AsyncStorage.setItem(HIDDEN_KEY, '1').catch(() => undefined);
  };

  return (
    <Card>
      <View style={styles.head}>
        <ThemedText type="subtitle">{s.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {s.progress(done, steps.length)}
        </ThemedText>
      </View>
      <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { backgroundColor: theme.signal, width: `${(done / steps.length) * 100}%` }]} />
      </View>
      {steps.map((step) => (
        <Pressable
          key={step.key}
          accessibilityRole="button"
          disabled={step.done}
          onPress={() => router.navigate(step.href)}
          style={({ pressed }) => [styles.step, pressed && { opacity: 0.7 }]}>
          <View style={[styles.dot, { borderColor: step.done ? theme.signal : theme.line, backgroundColor: step.done ? theme.signal : 'transparent' }]}>
            {step.done ? (
              <ThemedText type="smallBold" themeColor="onSignal" style={styles.tick}>
                ✓
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="small" themeColor={step.done ? 'textSecondary' : 'text'} style={{ flex: 1 }}>
            {s.steps[step.key]}
          </ThemedText>
          {!step.done ? (
            <ThemedText type="smallBold" themeColor="signal">
              →
            </ThemedText>
          ) : null}
        </Pressable>
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={s.hide} variant="ghost" small onPress={hide} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 12, lineHeight: 16 },
});
