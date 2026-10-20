-- BatiNode's own supplier picks, computed in the database. Done from the edge function with
-- 400+ ids in the URL, the lookups came back empty and the request went out to nobody.
create or replace function public.pick_suppliers(p_request_id uuid, p_count int)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select postal_code, category_id from price_requests where id = p_request_id
  ),
  n as (
    select ns.id, coalesce(ns.km, 999) as km from r, nearby_suppliers(r.postal_code, r.category_id) ns
  ),
  c as (
    select n.id, n.km, co.verified_at,
      (select count(distinct sc.category_id) from supplier_coverage sc where sc.supplier_id = n.id) as breadth,
      (select max(q.created_at) from quotes q where q.supplier_id = n.id) as last_asked
    from n
    join companies co on co.id = n.id
    where co.kind = 'supplier'
      and co.requests_stopped_at is null
      and coalesce(co.quote_email, co.email) is not null
      and not exists (select 1 from quotes q where q.request_id = p_request_id and q.supplier_id = n.id)
  )
  -- Within 10 km counts as equally close; without a category, general merchants first;
  -- then whoever was asked least recently, verified first, and chance.
  select c.id from c, r
  order by floor(c.km / 10),
    case when r.category_id is null then -c.breadth else 0 end,
    c.last_asked asc nulls first,
    (c.verified_at is null),
    random()
  limit greatest(p_count, 0);
$$;

revoke all on function public.pick_suppliers(uuid, int) from public, anon, authenticated;
grant execute on function public.pick_suppliers(uuid, int) to service_role;
