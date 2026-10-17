-- BatiLink: initial schema for phase 2 (multi-supplier price requests).
-- Suppliers never need an account: they answer through a signed, single-use link
-- handled by the `supplier-quote` edge function with the service role.

create type public.company_kind as enum ('contractor', 'supplier');
create type public.app_language as enum ('fr', 'nl');
create type public.plan_tier as enum ('free', 'pro', 'full');
create type public.request_status as enum ('draft', 'sent', 'closed', 'awarded');
create type public.quote_status as enum ('invited', 'submitted', 'declined', 'awarded', 'not_selected');

-- Companies -------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  kind public.company_kind not null,
  name text not null check (length(trim(name)) > 1),
  vat_number text unique check (vat_number ~ '^BE[01][0-9]{9}$'),
  email text,
  language public.app_language not null default 'fr',
  postal_code text check (postal_code ~ '^[1-9][0-9]{3}$'),
  city text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  company_id uuid references public.companies on delete set null,
  full_name text,
  language public.app_language not null default 'fr',
  role text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  company_id uuid primary key references public.companies on delete cascade,
  plan public.plan_tier not null default 'free',
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  provider_customer_id text,
  updated_at timestamptz not null default now()
);

-- Catalogue and supplier coverage ----------------------------------------------

create table public.categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  label_fr text not null,
  label_nl text not null
);

-- A supplier covers a category in every postal code starting with `postal_prefix`
-- ('14' covers 1400-1499, '1410' covers Waterloo only).
create table public.supplier_coverage (
  supplier_id uuid not null references public.companies on delete cascade,
  category_id smallint not null references public.categories,
  postal_prefix text not null check (postal_prefix ~ '^[1-9][0-9]{0,3}$'),
  primary key (supplier_id, category_id, postal_prefix)
);

-- Price requests ---------------------------------------------------------------

create table public.price_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  created_by uuid references auth.users on delete set null,
  title text not null check (length(trim(title)) > 2),
  category_id smallint not null references public.categories,
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{3}$'),
  city text,
  needed_by date,
  fulfilment text not null default 'delivery' check (fulfilment in ('delivery', 'pickup')),
  reply_by date not null,
  note text,
  status public.request_status not null default 'draft',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index price_requests_company_idx on public.price_requests (company_id, created_at desc);

create table public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.price_requests on delete cascade,
  position smallint not null default 0,
  label text not null check (length(trim(label)) > 1),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null check (unit in ('piece', 'bag', 't', 'kg', 'm', 'm2', 'm3', 'l', 'pallet'))
);
create index request_items_request_idx on public.request_items (request_id, position);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.price_requests on delete cascade,
  supplier_id uuid not null references public.companies,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  status public.quote_status not null default 'invited',
  delivery_fee numeric(12, 2) check (delivery_fee >= 0),
  lead_time_days integer check (lead_time_days >= 0),
  valid_until date,
  comment text,
  reminded_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, supplier_id)
);
create index quotes_request_idx on public.quotes (request_id);

create table public.quote_items (
  quote_id uuid not null references public.quotes on delete cascade,
  item_id uuid not null references public.request_items on delete cascade,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  primary key (quote_id, item_id)
);

-- Helpers ----------------------------------------------------------------------

create function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create function public.owns_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.price_requests where id = rid and company_id = public.my_company_id())
$$;

-- Called once after sign-up: creates the contractor company, links the user and
-- starts them on the free plan.
create function public.create_contractor_company(
  p_name text, p_vat text, p_postal_code text, p_city text, p_language public.app_language
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and company_id is not null) then
    raise exception 'company already created';
  end if;
  insert into public.companies (kind, name, vat_number, postal_code, city, language, email)
  values ('contractor', trim(p_name), upper(replace(replace(p_vat, '.', ''), ' ', '')), p_postal_code, p_city, p_language,
          (select email from auth.users where id = auth.uid()))
  returning id into cid;
  insert into public.profiles (id, company_id, language) values (auth.uid(), cid, p_language)
  on conflict (id) do update set company_id = excluded.company_id, language = excluded.language;
  insert into public.subscriptions (company_id) values (cid);
  return cid;
end $$;

-- Suppliers covering the request's category and postal code, nearest prefix first.
create function public.match_suppliers(p_request_id uuid)
returns table (id uuid, name text, city text, verified boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.verified_at is not null
  from public.price_requests r
  join public.supplier_coverage sc on sc.category_id = r.category_id and r.postal_code like sc.postal_prefix || '%'
  join public.companies c on c.id = sc.supplier_id and c.kind = 'supplier'
  where r.id = p_request_id and r.company_id = public.my_company_id()
  group by c.id
  order by max(length(sc.postal_prefix)) desc, c.name
$$;

-- Row level security -----------------------------------------------------------

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.categories enable row level security;
alter table public.supplier_coverage enable row level security;
alter table public.price_requests enable row level security;
alter table public.request_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

create policy "companies are visible to signed-in users" on public.companies
  for select to authenticated using (true);
create policy "admins update their company" on public.companies
  for update to authenticated using (id = public.my_company_id()) with check (id = public.my_company_id());

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "read own subscription" on public.subscriptions
  for select to authenticated using (company_id = public.my_company_id());

create policy "categories are public" on public.categories
  for select using (true);

create policy "coverage is visible to signed-in users" on public.supplier_coverage
  for select to authenticated using (true);

create policy "read own requests" on public.price_requests
  for select to authenticated using (company_id = public.my_company_id());
create policy "create own requests" on public.price_requests
  for insert to authenticated with check (company_id = public.my_company_id() and status = 'draft');
create policy "edit own drafts" on public.price_requests
  for update to authenticated using (company_id = public.my_company_id() and status = 'draft')
  with check (company_id = public.my_company_id() and status = 'draft');
create policy "delete own drafts" on public.price_requests
  for delete to authenticated using (company_id = public.my_company_id() and status = 'draft');

create policy "read items of own requests" on public.request_items
  for select to authenticated using (public.owns_request(request_id));
create policy "write items of own drafts" on public.request_items
  for all to authenticated
  using (exists (select 1 from public.price_requests r where r.id = request_id and r.company_id = public.my_company_id() and r.status = 'draft'))
  with check (exists (select 1 from public.price_requests r where r.id = request_id and r.company_id = public.my_company_id() and r.status = 'draft'));

-- Quotes are written only by edge functions (service role).
create policy "read quotes on own requests" on public.quotes
  for select to authenticated using (public.owns_request(request_id));
create policy "read quote lines on own requests" on public.quote_items
  for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and public.owns_request(q.request_id)));

-- token_hash must never reach the app: a table-wide grant would cover it, so the
-- app gets every other column explicitly (queries must list columns, not `*`).
revoke all on public.quotes from authenticated, anon;
grant select (id, request_id, supplier_id, status, delivery_fee, lead_time_days, valid_until,
              comment, reminded_at, submitted_at, created_at)
  on public.quotes to authenticated;

-- Seed -------------------------------------------------------------------------

insert into public.categories (slug, label_fr, label_nl) values
  ('gros-oeuvre', 'Gros œuvre', 'Ruwbouw'),
  ('isolation', 'Isolation', 'Isolatie'),
  ('bois-panneaux', 'Bois et panneaux', 'Hout en platen'),
  ('toiture', 'Toiture', 'Dakwerken'),
  ('carrelage', 'Carrelage', 'Tegels'),
  ('sanitaire', 'Sanitaire', 'Sanitair'),
  ('electricite', 'Électricité', 'Elektriciteit'),
  ('chauffage', 'Chauffage et ventilation', 'Verwarming en ventilatie'),
  ('menuiserie', 'Portes et fenêtres', 'Deuren en ramen'),
  ('outillage', 'Outillage et location', 'Gereedschap en verhuur');
