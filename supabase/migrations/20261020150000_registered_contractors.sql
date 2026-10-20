-- Verified contractors already on BatiNode, for the home screen and the full list.
-- Only public business details; the caller's own company and BatiNode's are left out.
create or replace function public.registered_contractors(p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, city text, postal_code text, trade_ids smallint[], verified_at timestamptz, total bigint)
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
    count(*) over ()
  from list l
  order by left(l.postal_code, 1) = (select region from mine) desc nulls last, l.verified_at desc nulls last, l.name
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.registered_contractors(text, int, int) from public, anon;
grant execute on function public.registered_contractors(text, int, int) to authenticated;
