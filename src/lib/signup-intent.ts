import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from '@/lib/signup';

// What a visitor chose before signing in (profile button, referral link), kept
// across the e-mail code step.
const INTENT_KEY = 'batilink.signup-intent';

export type SignupIntent = { profile?: Profile; referral?: string };

export async function saveIntent(intent: SignupIntent): Promise<void> {
  const current = await readIntent();
  await AsyncStorage.setItem(INTENT_KEY, JSON.stringify({ ...current, ...intent })).catch(() => undefined);
}

export async function readIntent(): Promise<SignupIntent> {
  try {
    const raw = await AsyncStorage.getItem(INTENT_KEY);
    return raw ? (JSON.parse(raw) as SignupIntent) : {};
  } catch {
    return {};
  }
}

export async function clearIntent(): Promise<void> {
  await AsyncStorage.removeItem(INTENT_KEY).catch(() => undefined);
}
