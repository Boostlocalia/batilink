import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { LEGAL_PAGES, legalTexts } from '@/legal';

/** Small row of links to the legal pages, for the foot of public screens. */
export function LegalLinks() {
  const { language } = useI18n();
  const { nav } = legalTexts(language);
  return (
    <View style={styles.row}>
      {LEGAL_PAGES.map((page) => (
        <Link key={page} href={`/legal/${page}`}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
            {nav[page]}
          </ThemedText>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.three, rowGap: Spacing.one, paddingVertical: Spacing.three },
  link: { textDecorationLine: 'underline' },
});
