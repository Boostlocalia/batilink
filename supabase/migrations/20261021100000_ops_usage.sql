-- What the hourly quota check (quota-watch) compares with the plan limits: database
-- and file sizes, accounts, and scheduled jobs that failed or got an error answer.
create or replace function public.ops_usage()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects),
    'users', (select count(*) from auth.users),
    'jobs_failed', (select count(*) from cron.job_run_details where status = 'failed' and start_time > now() - interval '24 hours'),
    'jobs_http_errors', (select count(*) from net._http_response where created > now() - interval '24 hours' and (status_code >= 400 or error_msg is not null))
  );
$$;

revoke all on function public.ops_usage() from public, anon, authenticated;
grant execute on function public.ops_usage() to service_role;

select cron.schedule('quota-watch', '0 * * * *', $$select public.call_job('quota-watch')$$);
