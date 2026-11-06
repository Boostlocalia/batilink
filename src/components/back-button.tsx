import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

/** A visible "← Retour" in the header of every inner page; home when there is nothing to go back to (link opened directly). */
export function BackButton() {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [
        { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: Spacing.three, borderWidth: 1, borderColor: theme.line, marginLeft: Spacing.two, marginRight: Spacing.two },
        pressed && { opacity: 0.7 },
      ]}>
      <ThemedText type="smallBold">{t.common.back}</ThemedText>
    </Pressable>
  );
}
