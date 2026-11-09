// Private mode: BatiNode runs for its owner only and everything that costs money is paused
// (plans and Stripe Checkout, the assistant, the news and e-mail jobs, commission bills).
// Turned on and off in the database: select public.private_mode_on(...) / private_mode_off().
// See docs/MODE-PRIVE.md.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { json } from './supabase.ts';

/** Whether private mode is on. A read error counts as on: when unsure, spend nothing. */
export async function privateMode(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from('private_mode').select('enabled').eq('id', true).maybeSingle();
  if (error) return true;
  return Boolean(data?.enabled);
}

/** The answer of a paused feature. */
export const paused = () => json({ error: 'private_mode' }, 503);
