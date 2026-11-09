-- Suggestions while a contractor types a supplier's name: every supplier around it,
-- connected (with an account) or not yet. Suppliers whose area is unknown are offered too.

create function public.suggest_suppliers()
returns table (id uuid, name text, city text, connected boolean, in_region boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select array_remove(c.regions || public.postal_region(c.postal_code), null) as own
    from public.companies c
    where c.id = public.my_company_id() and c.kind = 'contractor'
  ),
  area as (
    select
      (select coalesce(array_agg(p), '{}') from unnest(me.own) r, unnest(public.region_prefixes(r)) p) as own_prefixes,
      (select coalesce(array_agg(distinct p), '{}')
         from unnest(me.own) r, unnest(public.neighbour_regions(r) || r) w, unnest(public.region_prefixes(w)) p) as wide_prefixes
    from me
  ),
  scored as (
    select c.id, c.name, c.city,
      exists (select 1 from public.profiles pr where pr.company_id = c.id) as connected,
      exists (
        select 1 from unnest(a.own_prefixes) p
        where c.postal_code like p || '%'
           or exists (select 1 from public.supplier_coverage sc
                      where sc.supplier_id = c.id and (sc.postal_prefix like p || '%' or p like sc.postal_prefix || '%'))
      ) as in_region,
      exists (
        select 1 from unnest(a.wide_prefixes) p
        where c.postal_code like p || '%'
           or exists (select 1 from public.supplier_coverage sc
                      where sc.supplier_id = c.id and (sc.postal_prefix like p || '%' or p like sc.postal_prefix || '%'))
      ) as nearby,
      c.postal_code is null and not exists (select 1 from public.supplier_coverage sc where sc.supplier_id = c.id) as area_unknown,
      cardinality(a.wide_prefixes) = 0 as no_area
    from area a
    join public.companies c on c.kind = 'supplier'
  )
  select s.id, s.name, s.city, s.connected, s.in_region
  from scored s
  where s.nearby or s.area_unknown or s.no_area
  order by s.in_region desc, s.connected desc, s.name
  limit 1000
$$;

revoke all on function public.suggest_suppliers() from public, anon;
grant execute on function public.suggest_suppliers() to authenticated;

-- The team's register of suppliers: connected or not, who asked for them, how to reach them.
create view public.supplier_registry with (security_invoker = true) as
select
  c.id,
  c.name,
  c.city,
  c.postal_code,
  coalesce(c.quote_email, c.email) as email,
  c.phone,
  exists (select 1 from public.profiles pr where pr.company_id = c.id) as connected,
  c.vat_number,
  c.created_at,
  (select string_agg(k.name, ', ' order by k.name)
     from public.preferred_suppliers ps join public.companies k on k.id = ps.contractor_id
     where ps.supplier_id = c.id) as requested_by,
  (select count(*) from public.preferred_suppliers ps where ps.supplier_id = c.id) as contractors
from public.companies c
where c.kind = 'supplier';

revoke all on public.supplier_registry from public, anon, authenticated;
