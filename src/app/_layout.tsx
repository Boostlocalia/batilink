import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { NewPassword } from '@/components/new-password';
import { Colors } from '@/constants/theme';
import { LanguageProvider } from '@/i18n';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { ready, session, company, browsing, recovering } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (session && recovering) return <NewPassword />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session && (!!company || browsing)} redirectTo={session ? '/entreprise' : '/bienvenue'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="demande/[id]" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
        <Stack.Screen name="annonce/nouvelle" options={{ headerShown: true, headerBackTitle: '', title: '', presentation: 'modal' }} />
        <Stack.Screen name="annonce/[id]" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
        <Stack.Screen name="commande/[id]" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
        <Stack.Screen name="fournisseurs" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
        <Stack.Screen name="zones" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
        <Stack.Screen name="fichiers" options={{ headerShown: true, headerBackTitle: '', title: '' }} />
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
