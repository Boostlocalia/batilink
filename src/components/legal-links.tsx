import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { openCookieChoice } from '@/components/cookie-banner';

import { SocialLinks } from '@/components/social-links';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { LEGAL_PAGES, legalTexts } from '@/legal';

/** The foot of public screens: social logos, then a small row of links to the legal pages. */
export function LegalLinks() {
  const { language, t } = useI18n();
  const { nav } = legalTexts(language);
  return (
    <View>
      <SocialLinks />
      <View style={styles.row}>
        {LEGAL_PAGES.map((page) => (
          <Link key={page} href={`/legal/${page}`}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
              {nav[page]}
            </ThemedText>
          </Link>
        ))}
        {Platform.OS === 'web' ? (
          <Pressable onPress={openCookieChoice} accessibilityRole="button">
            <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
              {t.consent.choice}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.three, rowGap: Spacing.one, paddingVertical: Spacing.three },
  link: { textDecorationLine: 'underline' },
});
