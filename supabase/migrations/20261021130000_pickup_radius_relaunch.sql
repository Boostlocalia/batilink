-- Pickup at the shop: suppliers within 25 km of the site (delivery keeps 50 km).
-- Requests whose suppliers did not all answer in 48 h are relaunched once.
alter table public.price_requests add column if not exists relaunched_at timestamptz;

create or replace function public.request_radius_ok(p_fulfilment text, p_km double precision) returns boolean
language sql immutable as $fn$
  select case when p_fulfilment = 'pickup' then p_km is not null and p_km <= 25 else true end
$fn$;

create or replace function public.pick_suppliers(p_request_id uuid, p_count integer)
returns setof uuid
language sql stable security definer set search_path = public as $fn$
  with r as (
    select postal_code, category_id, fulfilment from price_requests where id = p_request_id
  ),
  n as (
    select ns.id, coalesce(ns.km, 999) as km from r, nearby_suppliers(r.postal_code, r.category_id) ns
    where request_radius_ok(r.fulfilment, ns.km)
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
  select c.id from c, r
  order by floor(c.km / 10),
    case when r.category_id is null then -c.breadth else 0 end,
    c.last_asked asc nulls first,
    (c.verified_at is null),
    random()
  limit greatest(p_count, 0);
$fn$;

create or replace function public.match_suppliers(p_request_id uuid)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = public as $fn$
  with r as (
    select * from public.price_requests where id = p_request_id and company_id = public.my_company_id()
  ), near as (
    select n.id, n.km from r, public.nearby_suppliers(r.postal_code, r.category_id) n
    where public.request_radius_ok(r.fulfilment, n.km)
  ), fav as (
    select ps.supplier_id as id from r join public.preferred_suppliers ps on ps.contractor_id = r.company_id
  )
  select c.id, c.name, c.city, c.verified_at is not null
  from public.companies c
  left join near on near.id = c.id
  left join fav on fav.id = c.id
  where c.kind = 'supplier' and c.requests_stopped_at is null and (near.id is not null or fav.id is not null)
  order by (fav.id is not null) desc, near.km nulls last, c.name
$fn$;

revoke execute on function public.request_radius_ok(text, double precision) from public, anon;
