-- Public count of the suppliers listed around a postal code, by category, for the
-- founders page ("are your suppliers already listed?"). Counts only: no names.
create function public.supplier_reach(p_postal text) returns json
language sql stable security definer set search_path = public as $$
  with near as (
    select distinct sc.supplier_id, sc.category_id
    from public.supplier_coverage sc
    join public.companies c on c.id = sc.supplier_id
    where p_postal ~ '^[1-9][0-9]{3}$'
      and p_postal like sc.postal_prefix || '%'
      and c.deleted_at is null
      and c.requests_stopped_at is null
  )
  select json_build_object(
    'total', (select count(distinct supplier_id) from near),
    'categories', coalesce((
      select json_agg(json_build_object('fr', k.label_fr, 'nl', k.label_nl, 'count', n.count) order by n.count desc)
      from (select category_id, count(*) from near group by category_id) n
      join public.categories k on k.id = n.category_id
    ), '[]'::json)
  )
$$;
revoke execute on function public.supplier_reach(text) from public;
grant execute on function public.supplier_reach(text) to anon, authenticated;
