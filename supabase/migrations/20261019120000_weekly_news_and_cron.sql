-- Weekly "new on Batinode" e-mail, which each company can turn off in Réglages.
alter table public.companies add column news_emails boolean not null default true;
grant select (news_emails) on public.companies to authenticated;
grant update (news_emails) on public.companies to authenticated;

-- Scheduled jobs. The shared secret lives in Vault (generated here, never shown):
-- pg_cron sends it, and the functions check it through check_cron_secret().
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'cron_secret', 'x-cron-secret for scheduled jobs');
  end if;
end $$;

create function public.check_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p_secret)
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

create function public.call_job(p_function text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://bkmzstdviytslegbxsax.supabase.co/functions/v1/' || p_function,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  )
$$;
revoke execute on function public.call_job(text) from public, anon, authenticated;

select cron.schedule('remind-suppliers', '0 * * * *', $$select public.call_job('remind-suppliers')$$);
select cron.schedule('verify-companies', '15 3 * * *', $$select public.call_job('verify-company')$$);
select cron.schedule('lifecycle', '0 7 * * *', $$select public.call_job('lifecycle')$$);
select cron.schedule('bill-commissions', '0 6 2 * *', $$select public.call_job('bill-commissions')$$);
