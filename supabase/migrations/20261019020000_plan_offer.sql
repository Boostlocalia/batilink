-- Plans Test (free), Starter (pro) and Premium (full). Test contractors take part in
-- the network for 3 exchanges (posts or answers) per calendar month; Starter and
-- Premium without limit. Price requests are for Premium (enforced in send-price-request).

create function public.network_exchanges_this_month(p_company uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from public.opportunities
      where company_id = p_company and created_at >= date_trunc('month', now()))
    + (select count(*) from public.opportunity_responses
      where company_id = p_company and created_at >= date_trunc('month', now()))
  )::integer
$$;
revoke execute on function public.network_exchanges_this_month(uuid) from public, anon, authenticated;

create function public.my_network_exchanges() returns integer
language sql stable security definer set search_path = public as $$
  select public.network_exchanges_this_month(public.my_company_id())
$$;
revoke execute on function public.my_network_exchanges() from public, anon;
grant execute on function public.my_network_exchanges() to authenticated;

create or replace function public.can_use_network() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    left join public.subscriptions s on s.company_id = c.id and s.status = 'active'
    where c.id = public.my_company_id()
      and c.verification_status <> 'rejected'
      and (
        c.kind = 'architect'
        or (c.kind = 'contractor' and (
          s.plan in ('pro', 'full')
          or public.network_exchanges_this_month(c.id) < 3
        ))
      )
  )
$$;
