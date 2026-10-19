-- Contractors who joined recently and are verified, for the "Nouveaux sur Batinode"
-- block. Same first postal digit (roughly the same province) comes first.
create function public.new_contractors(p_days int default 30)
returns table (id uuid, name text, city text, postal_code text, trade_ids smallint[], verified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.postal_code,
    coalesce(array_agg(ct.trade_id order by ct.trade_id) filter (where ct.trade_id is not null), '{}'),
    c.verified_at
  from public.companies c
  left join public.company_trades ct on ct.company_id = c.id
  where c.kind = 'contractor'
    and c.verification_status = 'verified'
    and c.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
    and c.id is distinct from public.my_company_id()
  group by c.id
  order by left(c.postal_code, 1) = (select left(me.postal_code, 1) from public.companies me where me.id = public.my_company_id()) desc nulls last,
    c.created_at desc
  limit 10
$$;
revoke execute on function public.new_contractors(int) from public, anon;
grant execute on function public.new_contractors(int) to authenticated;
