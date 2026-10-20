import { Link, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n, type Language } from '@/i18n';
import { isLegalPage, LEGAL_PAGES, legalTexts } from '@/legal';

/** Terms, privacy, cookies and legal notice: public, signed in or not. */
export default function LegalScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const { language, setLanguage } = useI18n();
  const theme = useTheme();
  const texts = legalTexts(language);
  const current = isLegalPage(page) ? page : 'conditions';
  const doc = texts.docs[current];

  return (
    <Screen withTabBar={false}>
      <View style={styles.header}>
        <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Logo size={22} />
        </Pressable>
        <Segmented<Language>
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'fr', label: 'FR' },
            { value: 'nl', label: 'NL' },
          ]}
        />
      </View>

      <View style={styles.tabs}>
        {LEGAL_PAGES.map((p) => (
          <Link key={p} href={`/legal/${p}`} replace>
            <View style={[styles.tab, { borderColor: p === current ? theme.signal : theme.line, backgroundColor: p === current ? theme.signal : 'transparent' }]}>
              <ThemedText type="smallBold" themeColor={p === current ? 'onSignal' : 'textSecondary'}>
                {texts.nav[p]}
              </ThemedText>
            </View>
          </Link>
        ))}
      </View>

      <View style={{ gap: Spacing.one }}>
        <ThemedText type="title">{doc.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {texts.updated}
        </ThemedText>
      </View>

      <Card>
        {doc.sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <ThemedText type="smallBold" themeColor="signal">
              {s.title}
            </ThemedText>
            {s.body.map((p) => (
              <ThemedText key={p} type="small">
                {p}
              </ThemedText>
            ))}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  section: { gap: Spacing.one, paddingVertical: Spacing.two },
});
