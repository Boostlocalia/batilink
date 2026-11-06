-- The material category of a price request is optional: a contractor whose materials
-- fit no category can still send it. Without one, every supplier covering the postal
-- code matches.
alter table public.price_requests alter column category_id drop not null;

create or replace function public.match_suppliers(p_request_id uuid)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.verified_at is not null
  from public.price_requests r
  join public.companies c on c.kind = 'supplier' and c.requests_stopped_at is null
  left join public.supplier_coverage sc
    on sc.supplier_id = c.id and (r.category_id is null or sc.category_id = r.category_id) and r.postal_code like sc.postal_prefix || '%'
  left join public.preferred_suppliers ps on ps.supplier_id = c.id and ps.contractor_id = r.company_id
  where r.id = p_request_id and r.company_id = public.my_company_id()
    and (sc.supplier_id is not null or ps.supplier_id is not null)
  group by c.id
  order by bool_or(ps.supplier_id is not null) desc, max(length(sc.postal_prefix)) desc nulls last, c.name
$$;

create or replace view public.price_observations as
select
  qi.unit_price,
  ri.unit,
  ri.quantity,
  lower(ri.label) as label,
  cat.slug as category,
  left(r.postal_code, 2) as region_prefix,
  q.supplier_id,
  q.submitted_at::date as observed_on,
  q.status = 'awarded' as awarded
from public.quote_items qi
join public.quotes q on q.id = qi.quote_id
join public.request_items ri on ri.id = qi.item_id
join public.price_requests r on r.id = q.request_id
left join public.categories cat on cat.id = r.category_id
where q.submitted_at is not null;
