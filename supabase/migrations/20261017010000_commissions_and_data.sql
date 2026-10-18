-- Commission on awarded offers, and room to grow: an append-only event log,
-- a price dataset for market statistics, and indexes for the hot queries.

-- Commission -------------------------------------------------------------------

-- The supplier pays a commission on every offer a contractor awards.
-- The default is 5 %; it is stored per supplier so it can be negotiated.
alter table public.companies
  add column commission_rate numeric(5, 4) not null default 0.05
    check (commission_rate >= 0 and commission_rate < 1);

-- The offer total is computed by the server when the supplier submits, so the
-- commission base never depends on the app. Accepting the commission terms is
-- required to submit an offer.
alter table public.quotes
  add column total_ex_vat numeric(14, 2) check (total_ex_vat >= 0),
  add column commission_accepted_at timestamptz;

grant select (total_ex_vat) on public.quotes to authenticated;

create type public.commission_status as enum ('pending', 'invoiced', 'paid', 'cancelled');

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes on delete restrict,
  supplier_id uuid not null references public.companies on delete restrict,
  contractor_id uuid not null references public.companies on delete restrict,
  -- Offer total excluding VAT, delivery included, frozen at award time.
  base_ex_vat numeric(14, 2) not null check (base_ex_vat >= 0),
  rate numeric(5, 4) not null,
  amount_ex_vat numeric(14, 2) not null check (amount_ex_vat >= 0),
  status public.commission_status not null default 'pending',
  awarded_at timestamptz not null default now(),
  invoiced_at timestamptz,
  paid_at timestamptz,
  invoice_number text
);
create index commissions_supplier_idx on public.commissions (supplier_id, awarded_at);
create index commissions_status_idx on public.commissions (status) where status in ('pending', 'invoiced');

-- Back office only: no policy, so signed-in users can neither read nor write.
alter table public.commissions enable row level security;
revoke all on public.commissions from anon, authenticated;

-- What to invoice each supplier per month.
create view public.commission_statements as
select
  date_trunc('month', c.awarded_at)::date as month,
  c.supplier_id,
  s.name as supplier_name,
  s.vat_number as supplier_vat,
  count(*) as awarded_offers,
  sum(c.base_ex_vat) as business_ex_vat,
  sum(c.amount_ex_vat) as commission_ex_vat,
  sum(c.amount_ex_vat) filter (where c.status = 'pending') as to_invoice_ex_vat
from public.commissions c
join public.companies s on s.id = c.supplier_id
where c.status <> 'cancelled'
group by 1, 2, 3, 4;
revoke all on public.commission_statements from anon, authenticated;

-- Event log --------------------------------------------------------------------

-- Append-only history of what happens on the platform (requests sent, offers
-- received, awards, reminders). Feeds analytics without touching live tables.
-- A BRIN index on time stays tiny even with hundreds of millions of rows.
create table public.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  kind text not null,
  company_id uuid references public.companies on delete set null,
  request_id uuid,
  quote_id uuid,
  data jsonb not null default '{}'::jsonb
);
create index events_time_brin on public.events using brin (occurred_at);
create index events_kind_time_idx on public.events (kind, occurred_at desc);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Price dataset ----------------------------------------------------------------

-- Every submitted unit price with its context: the base for "market price"
-- statistics per product family and region later on. Back office only.
create view public.price_observations as
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
join public.categories cat on cat.id = r.category_id
where q.submitted_at is not null;
revoke all on public.price_observations from anon, authenticated;

-- Indexes for the queries that grow with volume ---------------------------------

create index quotes_supplier_idx on public.quotes (supplier_id, created_at desc);
-- Reminder job: open invitations by age.
create index quotes_invited_idx on public.quotes (created_at) where status = 'invited' and reminded_at is null;
-- Closing job and monthly plan counts.
create index price_requests_open_idx on public.price_requests (reply_by) where status = 'sent';
create index price_requests_sent_idx on public.price_requests (company_id, sent_at) where sent_at is not null;
-- Supplier matching by category and postal prefix.
create index supplier_coverage_match_idx on public.supplier_coverage (category_id, postal_prefix);
create index quote_items_item_idx on public.quote_items (item_id);
create index profiles_company_idx on public.profiles (company_id);
