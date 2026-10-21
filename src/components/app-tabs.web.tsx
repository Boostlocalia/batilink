import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type PressableProps } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n, type Language } from '@/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Logo } from '@/components/logo';

export default function AppTabs() {
  const { t } = useI18n();
  const kind = useSession().company?.kind;
  // Someone still without a company is shown the contractor app.
  const contractor = kind === 'contractor' || !kind;
  return (
    <Tabs>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>{t.tabs.home}</TabButton>
          </TabTrigger>
          {kind !== 'supplier' ? (
            <TabTrigger name="reseau" href="/reseau" asChild>
              <TabButton>{t.tabs.network}</TabButton>
            </TabTrigger>
          ) : null}
          {contractor ? (
            <TabTrigger name="nouvelle" href="/nouvelle" asChild>
              <TabButton>{t.tabs.newRequest}</TabButton>
            </TabTrigger>
          ) : null}
          {contractor ? (
            <TabTrigger name="abonnement" href="/abonnement" asChild>
              <TabButton>{t.tabs.plans}</TabButton>
            </TabTrigger>
          ) : null}
          <TabTrigger name="reglages" href="/reglages" asChild>
            <TabButton>{t.tabs.settings}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...(props as PressableProps)}>
      <ThemedView type={isFocused ? 'backgroundSelected' : 'backgroundElement'} style={styles.tabButtonView}>
        <ThemedText type="smallBold" themeColor={isFocused ? 'signal' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

/** Always in the top bar, so nobody has to look for it in Réglages. */
function SignOut() {
  const { t } = useI18n();
  const { session } = useSession();
  if (!session) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut({ scope: 'local' })} style={styles.signOut}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t.settings.signOut}
      </ThemedText>
    </Pressable>
  );
}

function LanguageSwitch() {
  const { language, setLanguage } = useI18n();
  return (
    <View style={styles.languages}>
      {(['fr', 'nl'] as Language[]).map((l) => (
        <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: l === language }} onPress={() => setLanguage(l)}>
          <ThemedText type="smallBold" themeColor={l === language ? 'brand' : 'textSecondary'}>
            {l.toUpperCase()}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function CustomTabList(props: TabListProps) {
  const { width } = useWindowDimensions();
  // Phones: name and language on one line, the tabs scroll sideways underneath.
  if (width < 700) {
    return (
      <ThemedView type="backgroundElement" {...props} style={styles.tabListContainer}>
        <View style={styles.innerContainer}>
          <View style={styles.brandText}>
            <Logo />
          </View>
          <LanguageSwitch />
          <SignOut />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.scrollTabs}>
          {props.children}
        </ScrollView>
      </ThemedView>
    );
  }
  return (
    <ThemedView type="backgroundElement" {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <View style={styles.brandText}>
          <Logo />
        </View>
        {props.children}
        <LanguageSwitch />
        <SignOut />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    width: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollTabs: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  brandText: {
    marginRight: 'auto',
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  signOut: {
    marginLeft: Spacing.two,
  },
  languages: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginLeft: Spacing.three,
  },
});
