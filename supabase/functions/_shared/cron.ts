// Scheduled jobs send x-cron-secret: the CRON_SECRET env value, or the secret
// pg_cron reads from Vault (see 20261019120000_weekly_news_and_cron.sql).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function isCron(req: Request, admin: SupabaseClient): Promise<boolean> {
  const given = req.headers.get('x-cron-secret');
  if (!given) return false;
  const env = Deno.env.get('CRON_SECRET');
  if (env && given === env) return true;
  const { data } = await admin.rpc('check_cron_secret', { p_secret: given });
  return data === true;
}
