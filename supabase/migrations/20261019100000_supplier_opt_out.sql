-- A supplier can stop receiving price requests from the link in any request e-mail.
alter table public.companies add column requests_stopped_at timestamptz;

create or replace function public.match_suppliers(p_request_id uuid)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.verified_at is not null
  from public.price_requests r
  join public.companies c on c.kind = 'supplier' and c.requests_stopped_at is null
  left join public.supplier_coverage sc
    on sc.supplier_id = c.id and sc.category_id = r.category_id and r.postal_code like sc.postal_prefix || '%'
  left join public.preferred_suppliers ps on ps.supplier_id = c.id and ps.contractor_id = r.company_id
  where r.id = p_request_id and r.company_id = public.my_company_id()
    and (sc.supplier_id is not null or ps.supplier_id is not null)
  group by c.id
  order by bool_or(ps.supplier_id is not null) desc, max(length(sc.postal_prefix)) desc nulls last, c.name
$$;
