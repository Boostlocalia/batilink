-- The public counter also shows how many signed-up companies are in their free 7-day trial,
-- and how many suppliers BatiNode can ask for prices (counts only, nothing else is exposed).

create or replace function public.founder_offer() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', 50,
    'taken', (select count(*) from public.subscriptions where founder_number is not null),
    'registered', (select count(*) from public.companies c
                   where c.kind = 'contractor' and c.deleted_at is null
                     and exists (select 1 from public.profiles p where p.company_id = c.id)),
    'trial', (select count(*) from public.companies c join public.subscriptions s on s.company_id = c.id
              where c.kind = 'contractor' and c.deleted_at is null and s.founder_number is null
                and s.trial_ends_at > now()
                and exists (select 1 from public.profiles p where p.company_id = c.id)),
    'suppliers', (select count(*) from public.companies where kind = 'supplier' and deleted_at is null),
    'ends_at', '2027-04-01T00:00:00+02:00',
    'open', (select count(*) from public.subscriptions where founder_number is not null) < 50
            and now() < '2027-04-01T00:00:00+02:00'::timestamptz
  )
$$;
