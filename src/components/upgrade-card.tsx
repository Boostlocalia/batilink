import { router } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

export type UpgradeReason = 'monthly_limit' | 'too_many_suppliers' | 'network';

/** Shown at the moment a plan limit blocks the user, with the plan that lifts it. */
export function UpgradeCard({ reason }: { reason: UpgradeReason }) {
  const { t } = useI18n();
  const theme = useTheme();
  const c = t.growth.upgrade[reason];
  return (
    <Card style={{ borderColor: theme.signal }}>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="smallBold">{c.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {c.text}
        </ThemedText>
      </View>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={c.cta} variant="signal" small onPress={() => router.push('/abonnement')} />
      </View>
    </Card>
  );
}
