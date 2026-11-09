-- The founding offer is now for the first 50 paying companies (was 100). No place had been given when this changed.

alter table public.subscriptions drop constraint if exists subscriptions_founder_number_check;
alter table public.subscriptions add constraint subscriptions_founder_number_check check (founder_number between 1 and 50);

create or replace function public.founder_offer() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', 50,
    'taken', (select count(*) from public.subscriptions where founder_number is not null),
    'ends_at', '2027-04-01T00:00:00+02:00',
    'open', (select count(*) from public.subscriptions where founder_number is not null) < 50
            and now() < '2027-04-01T00:00:00+02:00'::timestamptz
  )
$$;

create or replace function public.claim_founder(p_company uuid, p_plan public.plan_tier) returns smallint
language plpgsql security definer set search_path = public as $$
declare
  current_number smallint;
  next_number smallint;
begin
  perform pg_advisory_xact_lock(hashtext('founder_places'));
  select founder_number into current_number from public.subscriptions where company_id = p_company;
  if current_number is not null then
    return current_number;
  end if;
  if now() >= '2027-04-01T00:00:00+02:00'::timestamptz then
    return null;
  end if;
  if exists (
    select 1 from public.profiles p join public.platform_admins a on a.user_id = p.id
    where p.company_id = p_company
  ) then
    return null;
  end if;
  select coalesce(max(founder_number), 0) + 1 into next_number
    from public.subscriptions where founder_number is not null;
  if next_number > 50 then
    return null;
  end if;
  update public.subscriptions
    set founder_number = next_number, founder_plan = p_plan, founder_since = now()
    where company_id = p_company;
  return next_number;
end
$$;
