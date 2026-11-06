-- Founding members: the first 100 companies that pay for a plan before 1 April 2027
-- (Brussels time) keep their launch price for life, while their subscription stays
-- active on the same plan. Places are numbered and never given back.

alter table public.subscriptions
  add column founder_number smallint unique check (founder_number between 1 and 100),
  add column founder_plan public.plan_tier,
  add column founder_since timestamptz,
  add column founder_ended_at timestamptz;

-- The offer as the public pages show it: no company is named, only the count.
create function public.founder_offer() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', 100,
    'taken', (select count(*) from public.subscriptions where founder_number is not null),
    'ends_at', '2027-04-01T00:00:00+02:00',
    'open', (select count(*) from public.subscriptions where founder_number is not null) < 100
            and now() < '2027-04-01T00:00:00+02:00'::timestamptz
  )
$$;
revoke execute on function public.founder_offer() from public;
grant execute on function public.founder_offer() to anon, authenticated;

-- Gives the next place to a company whose first paid plan just started. Called by
-- the Stripe webhook only (live payments). Returns the company's number, or null
-- when the offer is closed. The platform team's own companies never take a place.
create function public.claim_founder(p_company uuid, p_plan public.plan_tier) returns smallint
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
  if next_number > 100 then
    return null;
  end if;
  update public.subscriptions
    set founder_number = next_number, founder_plan = p_plan, founder_since = now()
    where company_id = p_company;
  return next_number;
end
$$;
revoke execute on function public.claim_founder(uuid, public.plan_tier) from public, anon, authenticated;
grant execute on function public.claim_founder(uuid, public.plan_tier) to service_role;
