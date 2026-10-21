import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example).');
}

/** Opened from a "forgot password" e-mail: read before the client clears the URL. */
export const openedFromRecovery =
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

let expired = false;

/** Whether the server ended this device's session: the app then opens the sign-in screen. */
export const sessionEnded = () => expired;

/** True once after the server ended this device's session; the sign-in screen says so. */
export function takeSessionExpired(): boolean {
  const was = expired;
  expired = false;
  return was;
}

// A function answering 401 while a session is stored: ask Auth whether the session still
// exists. When it was ended elsewhere, sign out on this device only, so the app shows the
// sign-in screen instead of "check your connection" everywhere.
async function checkSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase.auth.getUser();
  if (error && (error.status === 401 || error.status === 403)) {
    expired = true;
    await supabase.auth.signOut({ scope: 'local' });
  }
}

const watchedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (res.status === 401 && target.includes('/functions/v1/')) void checkSession();
  return res;
};

export const supabase = createClient(url, anonKey, {
  global: { fetch: watchedFetch },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On the web, the sign-in link in the e-mail lands back here with the session in the URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const functionsUrl = `${url}/functions/v1`;
export const anonHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
