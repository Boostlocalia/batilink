// Requests from a platform admin's own company are tests: the e-mails meant for
// real suppliers go to the support mailbox instead, marked with the real address.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { Mail } from './email.ts';

export async function isTestCompany(admin: SupabaseClient, companyId: string): Promise<boolean> {
  const { data: members } = await admin.from('profiles').select('id').eq('company_id', companyId);
  const ids = (members ?? []).map((m) => m.id);
  if (!ids.length) return false;
  const { count } = await admin.from('platform_admins').select('user_id', { count: 'exact', head: true }).in('user_id', ids);
  return (count ?? 0) > 0;
}

export function testMail(mail: Mail): Mail {
  return { ...mail, to: Deno.env.get('EMAIL_FROM') ?? 'support@batinode.be', subject: `[TEST → ${mail.to}] ${mail.subject}`, unsubscribeUrl: undefined };
}
