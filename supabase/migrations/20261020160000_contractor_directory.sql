-- Each company can leave the list of registered contractors (Réglages); the list also
-- shows who holds a founder place.
alter table public.companies add column if not exists directory_visible boolean not null default true;
grant select (directory_visible) on public.companies to authenticated;
grant update (directory_visible) on public.companies to authenticated;

create function public.contractor_directory(p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, city text, postal_code text, trade_ids smallint[], verified_at timestamptz, founder boolean, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select left(me.postal_code, 1) as region from companies me where me.id = my_company_id()
  ),
  list as (
    select c.id, c.name, c.city, c.postal_code, c.verified_at, c.created_at
    from companies c
    where c.kind = 'contractor'
      and c.verification_status = 'verified'
      and c.deleted_at is null
      and c.directory_visible
      and c.id is distinct from my_company_id()
      and not exists (select 1 from profiles p join platform_admins a on a.user_id = p.id where p.company_id = c.id)
      and (
        coalesce(trim(p_query), '') = ''
        or strpos(lower(c.name), lower(trim(p_query))) > 0
        or strpos(lower(coalesce(c.city, '')), lower(trim(p_query))) > 0
        or c.postal_code = trim(p_query)
      )
  )
  select l.id, l.name, l.city, l.postal_code,
    coalesce((select array_agg(ct.trade_id order by ct.trade_id) from company_trades ct where ct.company_id = l.id), '{}'),
    l.verified_at,
    exists (select 1 from subscriptions s where s.company_id = l.id and s.founder_number is not null and s.founder_ended_at is null),
    count(*) over ()
  from list l
  order by left(l.postal_code, 1) = (select region from mine) desc nulls last, l.verified_at desc nulls last, l.name
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.contractor_directory(text, int, int) from public, anon;
grant execute on function public.contractor_directory(text, int, int) to authenticated;
-- Replaced by contractor_directory, which leaves out companies that asked to be hidden.
revoke all on function public.registered_contractors(text, int, int) from public, anon, authenticated;
