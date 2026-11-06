-- Private mode: BatiNode runs for its owner only, and everything that costs money is paused.
-- Fully reversible: select public.private_mode_off(); reopens everything as it was.
-- See docs/MODE-PRIVE.md.
--
--   * new accounts are refused by the database, except for the addresses in allowed_emails;
--   * existing accounts outside allowed_emails are blocked (banned_until), and unblocked on reopening;
--   * the paying or e-mailing scheduled jobs are paused (the reminders to suppliers keep running,
--     they belong to the owner's own price requests);
--   * the functions read this table and refuse what costs money (plans and Stripe Checkout,
--     the assistant, the news, the lifecycle e-mails, the commission bills).

create table if not exists public.private_mode (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  allowed_emails text[] not null default '{}',
  paused_jobs text[] not null default '{}',
  blocked_users uuid[] not null default '{}',
  changed_at timestamptz not null default now()
);
insert into public.private_mode (id) values (true) on conflict do nothing;

-- Server only: no policy, no grant. The functions read it with the service role.
alter table public.private_mode enable row level security;
revoke all on public.private_mode from anon, authenticated;

-- Jobs paused in private mode: e-mails to companies, the Claude API, the commission bills.
create or replace function public.private_mode_jobs()
returns text[] language sql immutable set search_path = '' as $$
  select array['lifecycle', 'bill-commissions', 'news-daily', 'news-daily-retry', 'quota-watch']
$$;

-- Turns private mode on for the given addresses (lower case, compared exactly).
create or replace function public.private_mode_on(p_allowed text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[] := (select coalesce(array_agg(distinct lower(trim(e))), '{}') from unnest(p_allowed) e where trim(e) <> '');
  v_jobs text[];
  v_users uuid[];
  v_job record;
begin
  if cardinality(v_allowed) = 0 then
    raise exception 'private_mode_on needs at least one allowed address';
  end if;

  -- Pause the jobs that are running now, and remember them to resume exactly those.
  select coalesce(array_agg(jobname), '{}') into v_jobs
  from cron.job where jobname = any (public.private_mode_jobs()) and active;
  for v_job in select jobid from cron.job where jobname = any (v_jobs) loop
    perform cron.alter_job(v_job.jobid, active := false);
  end loop;

  -- Block the other accounts that are not blocked yet, and remember them.
  select coalesce(array_agg(id), '{}') into v_users
  from auth.users
  where lower(email) <> all (v_allowed) and (banned_until is null or banned_until < now());
  update auth.users set banned_until = 'infinity' where id = any (v_users);
  -- Their open sessions end now.
  delete from auth.sessions where user_id = any (v_users);
  delete from auth.refresh_tokens where user_id::uuid = any (v_users);

  update public.private_mode
  set enabled = true,
      allowed_emails = v_allowed,
      paused_jobs = (select coalesce(array_agg(distinct j), '{}') from unnest(paused_jobs || v_jobs) j),
      blocked_users = (select coalesce(array_agg(distinct u), '{}') from unnest(blocked_users || v_users) u),
      changed_at = now()
  where id;

  return (select to_jsonb(p) from public.private_mode p where id);
end $$;

-- Reopens: resumes the paused jobs, unblocks the blocked accounts, accepts sign-ups again.
create or replace function public.private_mode_off()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_state public.private_mode;
  v_job record;
begin
  select * into v_state from public.private_mode where id;
  for v_job in select jobid from cron.job where jobname = any (v_state.paused_jobs) loop
    perform cron.alter_job(v_job.jobid, active := true);
  end loop;
  update auth.users set banned_until = null where id = any (v_state.blocked_users) and banned_until = 'infinity';
  update public.private_mode
  set enabled = false, paused_jobs = '{}', blocked_users = '{}', changed_at = now()
  where id;
  return (select to_jsonb(p) from public.private_mode p where id);
end $$;

-- Lets one more address in while private mode is on (e.g. a colleague).
create or replace function public.private_mode_allow(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  update public.private_mode
  set allowed_emails = (select array_agg(distinct e) from unnest(allowed_emails || v_email) e),
      changed_at = now()
  where id;
  update auth.users set banned_until = null where lower(email) = v_email and banned_until = 'infinity';
  update public.private_mode set blocked_users = array(select u from unnest(blocked_users) u
    where u not in (select id from auth.users where lower(email) = v_email)) where id;
  return (select to_jsonb(p) from public.private_mode p where id);
end $$;

-- Only the owner, from the SQL editor (or the service role), can switch it.
revoke all on function public.private_mode_jobs() from public, anon, authenticated;
revoke all on function public.private_mode_on(text[]) from public, anon, authenticated;
revoke all on function public.private_mode_off() from public, anon, authenticated;
revoke all on function public.private_mode_allow(text) from public, anon, authenticated;

-- The database itself refuses a new account outside the allowed addresses: the app, an old
-- version of it, or a direct call to the Auth API all end here.
create or replace function public.private_mode_guard_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.private_mode
    where id and enabled and lower(coalesce(new.email, '')) <> all (allowed_emails)
  ) then
    raise exception 'signups_closed: BatiNode is in private mode' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.private_mode_guard_signup() from public, anon, authenticated;

drop trigger if exists private_mode_guard_signup on auth.users;
create trigger private_mode_guard_signup
  before insert on auth.users
  for each row execute function public.private_mode_guard_signup();
