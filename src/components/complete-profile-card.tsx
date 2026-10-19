import { router } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

/** Shown to someone visiting without a company yet, where the next step needs one. */
export function CompleteProfileCard({ text }: { text: string }) {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <Card style={{ borderColor: theme.signal, gap: Spacing.two }}>
      <ThemedText type="subtitle">{t.signup.later.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{text}</ThemedText>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button label={t.signup.later.cta} variant="signal" onPress={() => router.push('/entreprise')} />
      </View>
    </Card>
  );
}
