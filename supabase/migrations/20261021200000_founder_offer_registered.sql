-- The founder counter also shows how many contractor companies have signed up (a count only).

create or replace function public.founder_offer() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', 50,
    'taken', (select count(*) from public.subscriptions where founder_number is not null),
    'registered', (select count(*) from public.companies c
                   where c.kind = 'contractor' and exists (select 1 from public.profiles p where p.company_id = c.id)),
    'ends_at', '2027-04-01T00:00:00+02:00',
    'open', (select count(*) from public.subscriptions where founder_number is not null) < 50
            and now() < '2027-04-01T00:00:00+02:00'::timestamptz
  )
$$;
