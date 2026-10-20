-- Name search over the supplier directory, for a contractor adding a supplier they
-- know to a price request. Directory facts only (name, town, verified), 8 at most.
create function public.search_suppliers(p_query text)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.city, c.verified_at is not null
  from public.companies c
  where public.my_company_id() is not null
    and char_length(btrim(p_query)) between 2 and 60
    and c.kind = 'supplier'
    and c.requests_stopped_at is null
    and (c.name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
         or c.city ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%')
  order by (c.name ilike replace(replace(btrim(p_query), '%', ''), '_', '') || '%') desc, c.verified_at is not null desc, c.name
  limit 8
$$;
revoke all on function public.search_suppliers(text) from public, anon;
grant execute on function public.search_suppliers(text) to authenticated;
