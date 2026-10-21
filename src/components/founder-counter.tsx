import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { founderLastDay, useFounderOffer } from '@/lib/founders';

/** Live count of the founding places, as a card. Shows nothing until the count is known. */
export function FounderCounter({ cta }: { cta?: 'page' | 'signup' }) {
  const { t, locale } = useI18n();
  const f = t.growth.founders;
  const theme = useTheme();
  const offer = useFounderOffer();
  if (!offer) return null;
  const left = offer.total - offer.taken;
  const share = Math.min(1, offer.taken / offer.total);
  return (
    <Card style={{ borderColor: theme.signal, gap: Spacing.two }}>
      <ThemedText type="small" themeColor="signal" style={styles.eyebrow}>
        {f.eyebrow.toUpperCase()}
      </ThemedText>
      <ThemedText type="subtitle">{offer.open ? f.left(left) : left > 0 ? f.ended : f.closed}</ThemedText>
      <View style={[styles.track, { backgroundColor: theme.line }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: theme.signal }]} />
      </View>
      <ThemedText type="smallBold">{f.counter(offer.taken, offer.total)}</ThemedText>
      {offer.registered > 0 || offer.suppliers > 0 ? (
        <ThemedText type="small">
          {[
            offer.registered > 0 ? f.registered(offer.registered) + (offer.trial > 0 ? `, ${f.trial(offer.trial)}` : '') : '',
            offer.suppliers > 0 ? f.suppliers(offer.suppliers) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        {f.counterNote} {offer.open ? f.until(founderLastDay(offer, locale)) : ''}
      </ThemedText>
      {cta && offer.open ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            label={cta === 'page' ? f.learn : f.cta}
            variant="signal"
            small
            onPress={() => (cta === 'page' ? router.push('/fondateurs') : router.push({ pathname: '/connexion', params: { mode: 'inscription' } }))}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { letterSpacing: 1 },
  track: { height: 8, borderRadius: Radius, overflow: 'hidden' },
  fill: { height: 8 },
});
