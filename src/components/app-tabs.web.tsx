import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, View, StyleSheet, type PressableProps } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useI18n, type Language } from '@/i18n';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const { t } = useI18n();
  return (
    <Tabs>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>{t.tabs.home}</TabButton>
          </TabTrigger>
          <TabTrigger name="nouvelle" href="/nouvelle" asChild>
            <TabButton>{t.tabs.newRequest}</TabButton>
          </TabTrigger>
          <TabTrigger name="abonnement" href="/abonnement" asChild>
            <TabButton>{t.tabs.plans}</TabButton>
          </TabTrigger>
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
        <ThemedText type="smallBold" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
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
  return (
    <ThemedView type="backgroundElement" {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <ThemedText type="subtitle" themeColor="brand" style={styles.brandText}>
          BatiLink
        </ThemedText>
        {props.children}
        <LanguageSwitch />
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
  brandText: {
    marginRight: 'auto',
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  languages: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginLeft: Spacing.three,
  },
});
