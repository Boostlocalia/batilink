import AsyncStorage from '@react-native-async-storage/async-storage';

// A page opened from an e-mail link before signing in (or with another account), reopened after the sign-in.
const KEY = 'batilink.return-to';
// Only the app's own record pages: never a full URL, so the link cannot send anyone elsewhere.
const ALLOWED = /^\/(demande|commande|discussion|annonce)\/[A-Za-z0-9-]{1,64}$/;

export const returnable = (path: string | null | undefined): path is string => !!path && ALLOWED.test(path);

export async function keepReturnTo(path: string): Promise<void> {
  if (!returnable(path)) return;
  await AsyncStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() })).catch(() => undefined);
}

export async function takeReturnTo(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const { path, at } = JSON.parse(raw) as { path: string; at: number };
    // A link kept more than a day ago is stale.
    return returnable(path) && Date.now() - at < 86_400_000 ? path : null;
  } catch {
    return null;
  }
}
