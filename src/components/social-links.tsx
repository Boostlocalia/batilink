import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SOCIAL_LINKS } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

const ICONS = {
  instagram: require('@/assets/images/social/instagram.png'),
  facebook: require('@/assets/images/social/facebook.png'),
  linkedin: require('@/assets/images/social/linkedin.png'),
  tiktok: require('@/assets/images/social/tiktok.png'),
};

/** "Follow us" with BatiNode's social logos; a logo links once its page address is set. */
export function SocialLinks() {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <ThemedText type="small" themeColor="textSecondary">
        {t.social.follow}
      </ThemedText>
      <View style={styles.row}>
        {SOCIAL_LINKS.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole={s.url ? 'link' : 'image'}
            accessibilityLabel={s.label}
            disabled={!s.url}
            onPress={() => s.url && Linking.openURL(s.url)}
            hitSlop={8}>
            <Image source={ICONS[s.key]} style={styles.icon} tintColor={theme.text} contentFit="contain" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.four },
  icon: { width: 24, height: 24 },
});
