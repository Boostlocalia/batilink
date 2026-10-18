-- Conversion and revenue: Pro trial, yearly billing, referrals, a signed-in
-- supplier space and the funnel the team watches each week.

-- Trial and billing interval -------------------------------------------------------

-- A trial is plan 'pro' with trial_ends_at set and no Stripe subscription; the
-- daily lifecycle job moves it back to 'free' when it ends.
alter table public.subscriptions
  add column trial_ends_at timestamptz,
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year'));

-- Links a signed-in supplier opens from its space ---------------------------------
-- The e-mailed quote link stays valid; each in-app opening gets its own short link.

create table public.quote_links (
  token_hash text primary key,
  quote_id uuid not null references public.quotes on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index quote_links_quote_idx on public.quote_links (quote_id);
alter table public.quote_links enable row level security;
revoke all on public.quote_links from authenticated, anon;

-- Referrals ----------------------------------------------------------------------------

-- One reward per referred company, granted once it is verified.
--   pro_days          the referrer on the free plan gets Pro for `days`
--   stripe_balance    a paying referrer gets `amount_ex_vat` off its next invoice
--   commission_credit a supplier gets `amount_ex_vat` off its next commission bill
create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.companies on delete cascade,
  referred_id uuid not null unique references public.companies on delete cascade,
  kind text not null check (kind in ('pro_days', 'stripe_balance', 'commission_credit')),
  days integer,
  amount_ex_vat numeric(10, 2),
  used_bill_id uuid references public.commission_bills on delete set null,
  used_at timestamptz,
  granted_at timestamptz not null default now()
);
create index referral_rewards_referrer_idx on public.referral_rewards (referrer_id);
alter table public.referral_rewards enable row level security;
create policy "referrers read own rewards" on public.referral_rewards
  for select to authenticated using (referrer_id = public.my_company_id());
revoke all on public.referral_rewards from authenticated, anon;
grant select (id, kind, days, amount_ex_vat, granted_at) on public.referral_rewards to authenticated;

-- Companies a user referred (names only), for the referral card.
create function public.my_referrals() returns table (name text, kind public.company_kind, verified boolean, rewarded boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.name, c.kind, c.verification_status = 'verified',
         exists (select 1 from public.referral_rewards r where r.referred_id = c.id),
         c.created_at
  from public.companies c
  where c.referred_by = public.my_company_id()
  order by c.created_at desc
$$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- Contractors invite their own suppliers ---------------------------------------------

create table public.supplier_invitations (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.companies on delete cascade,
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name text,
  supplier_id uuid references public.companies on delete set null,
  sent_at timestamptz not null default now(),
  unique (contractor_id, email)
);
alter table public.supplier_invitations enable row level security;
create policy "contractors read own invitations" on public.supplier_invitations
  for select to authenticated using (contractor_id = public.my_company_id());
revoke all on public.supplier_invitations from authenticated, anon;
grant select (id, email, name, supplier_id, sent_at) on public.supplier_invitations to authenticated;

-- A contractor's favourite suppliers are always offered on its requests.
create table public.preferred_suppliers (
  contractor_id uuid not null references public.companies on delete cascade,
  supplier_id uuid not null references public.companies on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contractor_id, supplier_id)
);
alter table public.preferred_suppliers enable row level security;
create policy "contractors read own favourites" on public.preferred_suppliers
  for select to authenticated using (contractor_id = public.my_company_id());
create policy "contractors add favourites" on public.preferred_suppliers
  for insert to authenticated with check (
    contractor_id = public.my_company_id()
    and exists (select 1 from public.companies where id = supplier_id and kind = 'supplier'));
create policy "contractors remove favourites" on public.preferred_suppliers
  for delete to authenticated using (contractor_id = public.my_company_id());
revoke all on public.preferred_suppliers from authenticated, anon;
grant select, insert, delete on public.preferred_suppliers to authenticated;

-- Lifecycle e-mails are sent once per company and kind.
create table public.lifecycle_messages (
  company_id uuid not null references public.companies on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (company_id, kind)
);
alter table public.lifecycle_messages enable row level security;
revoke all on public.lifecycle_messages from authenticated, anon;

-- Funnel (back office) -------------------------------------------------------------

-- Week by week: who signed up, who reached their first useful action, who pays.
create view public.funnel_weekly with (security_invoker = true) as
with c as (
  select c.id, c.kind, date_trunc('week', c.created_at)::date as week, c.verification_status
  from public.companies c
  where c.created_at is not null
),
activated as (
  select distinct company_id from public.events where kind = 'request_sent'
  union
  select distinct q.supplier_id from public.quotes q where q.status in ('submitted', 'awarded', 'not_selected')
  union
  select distinct o.company_id from public.opportunities o
),
paying as (
  select company_id from public.subscriptions where plan in ('pro', 'full') and status = 'active' and provider_subscription_id is not null
  union
  select supplier_id from public.commission_bills where status = 'paid'
)
select
  c.week,
  c.kind,
  count(*) as signups,
  count(*) filter (where c.verification_status = 'verified') as verified,
  count(*) filter (where c.id in (select company_id from activated)) as activated,
  count(*) filter (where c.id in (select company_id from paying)) as paying
from c
group by c.week, c.kind
order by c.week desc, c.kind;
revoke all on public.funnel_weekly from authenticated, anon;

-- Monthly recurring revenue and commission, for the dashboard.
create view public.revenue_monthly with (security_invoker = true) as
select
  date_trunc('month', now())::date as month,
  (select count(*) from public.subscriptions where plan = 'pro' and status = 'active' and provider_subscription_id is not null) as pro,
  (select count(*) from public.subscriptions where plan = 'full' and status = 'active' and provider_subscription_id is not null) as full,
  (select count(*) from public.subscriptions where trial_ends_at > now() and provider_subscription_id is null) as trials,
  (select coalesce(sum(amount_ex_vat), 0) from public.commissions
     where status in ('pending', 'invoiced', 'paid') and awarded_at >= date_trunc('month', now())) as commission_this_month_ex_vat,
  (select coalesce(sum(amount_ex_vat), 0) from public.commission_bills where status = 'paid'
     and paid_at >= date_trunc('month', now())) as commission_collected_this_month_ex_vat;
revoke all on public.revenue_monthly from authenticated, anon;

-- Favourite suppliers are offered on every request of the contractor, wherever they deliver.
create or replace function public.match_suppliers(p_request_id uuid)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.verified_at is not null
  from public.price_requests r
  join public.companies c on c.kind = 'supplier'
  left join public.supplier_coverage sc
    on sc.supplier_id = c.id and sc.category_id = r.category_id and r.postal_code like sc.postal_prefix || '%'
  left join public.preferred_suppliers ps on ps.supplier_id = c.id and ps.contractor_id = r.company_id
  where r.id = p_request_id and r.company_id = public.my_company_id()
    and (sc.supplier_id is not null or ps.supplier_id is not null)
  group by c.id
  order by bool_or(ps.supplier_id is not null) desc, max(length(sc.postal_prefix)) desc nulls last, c.name
$$;
