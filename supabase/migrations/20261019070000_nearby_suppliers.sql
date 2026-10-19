-- Suppliers a contractor can pick from: those serving its provinces and the neighbouring ones.

create function public.postal_region(p_postal text) returns text
language sql immutable set search_path = '' as $$
  select r from unnest(array['BRU', 'BW', 'VB', 'ANT', 'LIM', 'LIE', 'NAM', 'HAI', 'LUX', 'WVL', 'OVL']) r
  where exists (select 1 from unnest(public.region_prefixes(r)) p where p_postal like p || '%')
  limit 1
$$;

create function public.neighbour_regions(p_region text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_region
    when 'BRU' then array['BW', 'VB']
    when 'BW'  then array['BRU', 'VB', 'NAM', 'HAI', 'LIE']
    when 'VB'  then array['BRU', 'BW', 'ANT', 'LIM', 'OVL', 'HAI', 'LIE']
    when 'ANT' then array['VB', 'LIM', 'OVL']
    when 'LIM' then array['ANT', 'VB', 'LIE']
    when 'LIE' then array['LIM', 'VB', 'BW', 'NAM', 'LUX']
    when 'NAM' then array['BW', 'HAI', 'LIE', 'LUX']
    when 'HAI' then array['BW', 'VB', 'OVL', 'WVL', 'NAM']
    when 'LUX' then array['LIE', 'NAM']
    when 'WVL' then array['OVL', 'HAI']
    when 'OVL' then array['WVL', 'ANT', 'VB', 'HAI']
    else array[]::text[]
  end
$$;

create function public.nearby_suppliers()
returns table (id uuid, name text, city text, verified boolean, in_region boolean, favourite boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select c.id, array_remove(c.regions || public.postal_region(c.postal_code), null) as own
    from public.companies c
    where c.id = public.my_company_id() and c.kind = 'contractor'
  ),
  area as (
    select me.id,
      (select coalesce(array_agg(p), '{}') from unnest(me.own) r, unnest(public.region_prefixes(r)) p) as own_prefixes,
      (select coalesce(array_agg(distinct p), '{}')
         from unnest(me.own) r, unnest(public.neighbour_regions(r) || r) w, unnest(public.region_prefixes(w)) p) as wide_prefixes
    from me
  ),
  scored as (
    select c.id, c.name, c.city, c.verified_at is not null as verified,
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
      exists (select 1 from public.preferred_suppliers ps where ps.contractor_id = a.id and ps.supplier_id = c.id) as favourite,
      cardinality(a.wide_prefixes) = 0 as no_area
    from area a
    join public.companies c on c.kind = 'supplier' and c.vat_number is not null
  )
  select s.id, s.name, s.city, s.verified, s.in_region, s.favourite
  from scored s
  -- Without a known area, every supplier is offered.
  where s.nearby or s.no_area
  order by s.in_region desc, s.name
  limit 500
$$;

revoke all on function public.nearby_suppliers() from public, anon;
grant execute on function public.nearby_suppliers() to authenticated;
