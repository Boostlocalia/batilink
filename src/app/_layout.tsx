import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { LanguageProvider } from '@/i18n';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, session, company } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && !!company} redirectTo="/connexion">
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="demande/[id]" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !company} redirectTo="/connexion">
        <Stack.Screen name="entreprise" />
      </Stack.Protected>
      <Stack.Protected guard={!session} redirectTo="/">
        <Stack.Screen name="connexion" />
      </Stack.Protected>
      {/* Suppliers answer from the e-mail link, signed in or not. */}
      <Stack.Screen name="offre/[token]" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
