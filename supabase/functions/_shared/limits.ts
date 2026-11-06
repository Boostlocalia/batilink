// Abuse guards shared by the edge functions.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Records one call for `key` and says whether it goes over `max` calls in the last `windowSeconds`. */
export async function overLimit(admin: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count } = await admin.from('api_calls').select('id', { count: 'exact', head: true }).eq('key', key).gte('created_at', since);
  if ((count ?? 0) >= max) return true;
  await admin.from('api_calls').insert({ key });
  return false;
}

/** Compares two secrets without leaking, through timing, how much of them matched. */
export async function sameSecret(given: string | null | undefined, expected: string | null | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
