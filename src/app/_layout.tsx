import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { BackButton } from '@/components/back-button';
import { NewPassword } from '@/components/new-password';
import { Colors } from '@/constants/theme';
import { LanguageProvider } from '@/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { sessionEnded } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

// The web app behaves like a native one: a two-finger pinch zooms in, and the page springs
// back to its normal size when the fingers are lifted. The browser's own zoom, which stays
// where it is left, is off, and so is the zoom when a field gets the focus.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  // iOS Safari ignores user-scalable for pinches: stop its gesture events instead.
  for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

  const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let start = 0;
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2) return;
      const root = document.getElementById('root');
      if (!root) return;
      start = gap(e.touches);
      root.style.transition = 'none';
      root.style.transformOrigin = `${(e.touches[0].clientX + e.touches[1].clientX) / 2}px ${(e.touches[0].clientY + e.touches[1].clientY) / 2}px`;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      const root = document.getElementById('root');
      if (root) root.style.transform = `scale(${Math.min(3, Math.max(1, gap(e.touches) / start))})`;
    },
    { passive: false },
  );
  const release = (e: TouchEvent) => {
    if (!start || e.touches.length >= 2) return;
    start = 0;
    const root = document.getElementById('root');
    if (!root) return;
    root.style.transition = 'transform 0.22s ease-out';
    root.style.transform = '';
  };
  document.addEventListener('touchend', release);
  document.addEventListener('touchcancel', release);
}

/** Inner pages: a header with the page title and a clear back button. */
const INNER = { headerShown: true, headerBackTitle: '', title: '', headerBackVisible: false, headerLeft: () => <BackButton /> };

function RootNavigator() {
  const { ready, session, company, browsing, recovering } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (session && recovering) return <NewPassword />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && (!!company || browsing)} redirectTo={session ? '/entreprise' : sessionEnded() ? '/connexion' : '/bienvenue'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="demande/[id]" options={INNER} />
        <Stack.Screen name="annonce/nouvelle" options={{ ...INNER, presentation: 'modal' }} />
        <Stack.Screen name="annonce/[id]" options={INNER} />
        <Stack.Screen name="commande/[id]" options={INNER} />
        <Stack.Screen name="fournisseurs" options={INNER} />
        <Stack.Screen name="entrepreneurs" options={INNER} />
        <Stack.Screen name="parrainage" options={INNER} />
        <Stack.Screen name="demandes" options={INNER} />
        <Stack.Screen name="zones" options={INNER} />
        <Stack.Screen name="admin" options={INNER} />
        <Stack.Screen name="discussion/[id]" options={INNER} />
        <Stack.Screen name="discussion/nouvelle" options={INNER} />
        <Stack.Screen name="fichiers" options={INNER} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !company} redirectTo="/connexion">
        <Stack.Screen name="entreprise" />
      </Stack.Protected>
      <Stack.Protected guard={!session} redirectTo="/">
        <Stack.Screen name="bienvenue" />
        <Stack.Screen name="connexion" />
      </Stack.Protected>
      {/* Suppliers answer from the e-mail link, signed in or not. */}
      <Stack.Screen name="offre/[token]" />
      <Stack.Screen name="bon/[token]" />
      <Stack.Screen name="legal/[page]" />
      <Stack.Screen name="fondateurs" />
    </Stack>
  );
}

// The app is dark only: headers and backgrounds follow the palette.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.signal,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.line,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <LanguageProvider>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
