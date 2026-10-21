import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { privatePath, readConsent, saveConsent, track, type Consent } from '@/lib/meta-pixel';

let reopen: (() => void) | null = null;

/** Opens the cookie banner again (link in the legal footer). */
export function openCookieChoice() {
  reopen?.();
}

/** Web only: asks once whether the Meta pixel may run; refusing is as easy as accepting. */
export function CookieBanner() {
  const { t } = useI18n();
  const theme = useTheme();
  const path = usePathname();
  // Asked once per load until the visitor answers; private pages never show it.
  const [open, setOpen] = useState(() => readConsent() === null);

  useEffect(() => {
    reopen = () => setOpen(true);
    return () => {
      reopen = null;
    };
  }, []);

  // One page view per screen, once the pixel runs.
  useEffect(() => {
    track('PageView');
  }, [path]);

  if (Platform.OS !== 'web' || !open || privatePath(path)) return null;

  const choose = (choice: Consent) => {
    const before = readConsent();
    saveConsent(choice);
    setOpen(false);
    if (choice === 'yes') track('PageView');
    // Withdrawing consent: reload so the pixel is gone from the page.
    if (choice === 'no' && before === 'yes') window.location.reload();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}>
        <ThemedText type="small">{t.consent.text}</ThemedText>
        <View style={styles.row}>
          <Button label={t.consent.refuse} variant="ghost" small onPress={() => choose('no')} />
          <Button label={t.consent.accept} variant="ghost" small onPress={() => choose('yes')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fixed to the window on the web, above the page and the tab bar.
  wrap: { position: 'fixed' as 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1000, padding: Spacing.three, alignItems: 'center' },
  box: { maxWidth: 560, width: '100%', borderWidth: 1, borderRadius: Radius, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, flexWrap: 'wrap' },
});
