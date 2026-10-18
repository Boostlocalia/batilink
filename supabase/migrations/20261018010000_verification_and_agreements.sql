-- Company verification against Belgian registers, and agreements between contractors.
--
-- Every contractor is checked when they sign up and again periodically:
--   vat        VAT number active (EU VIES)
--   kbo        enterprise active in the Crossroads Bank for Enterprises (BCE/KBO),
--              with a construction activity (NACE section F)
--   retention  retention obligation under art. 30bis (ONSS social debts, INASTI
--              self-employed debts) and art. 400-408 CIR 92 (tax debts), from the
--              ONSS "billRetainment" service
-- Right before two contractors confirm an agreement, the checks run again, fresh.

-- Architects will look for contractors for their projects (planned, not built yet).
alter type public.company_kind add value if not exists 'architect';

-- Companies: lock down what users may read and change -------------------------

-- Before this migration a company admin could update any column, including
-- verified_at and commission_rate. Only profile fields stay editable now.
revoke update on public.companies from authenticated;
grant update (name, language, postal_code, city) on public.companies to authenticated;

create type public.verification_status as enum ('pending', 'verified', 'needs_review', 'rejected');

alter table public.companies
  add column verification_status public.verification_status not null default 'pending',
  add column last_checked_at timestamptz,
  -- Latest withholding rates a client must apply when paying this company (0 when none).
  add column retention_social_pct numeric(5, 2) not null default 0,
  add column retention_tax_pct numeric(5, 2) not null default 0;

-- Signed-in users see other companies' public profile, not their e-mail address
-- (exchanges go through the platform) nor their commercial terms.
revoke select on public.companies from authenticated, anon;
grant select (id, kind, name, vat_number, language, postal_code, city, verified_at, verification_status,
              last_checked_at, retention_social_pct, retention_tax_pct, created_at)
  on public.companies to authenticated;

-- Check history (append-only, back office) -------------------------------------

create type public.check_kind as enum ('vat', 'kbo', 'retention');
create type public.check_outcome as enum ('ok', 'warning', 'failed', 'unavailable');

create table public.company_checks (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies on delete cascade,
  kind public.check_kind not null,
  outcome public.check_outcome not null,
  -- Why the check ran: signup, periodic, agreement, manual.
  reason text not null,
  agreement_id uuid,
  -- Human-readable finding codes (e.g. vat_invalid, kbo_not_active, retention_social).
  findings text[] not null default '{}',
  -- Raw answer from the register, kept as evidence.
  evidence jsonb not null default '{}',
  checked_at timestamptz not null default now()
);
create index company_checks_company_idx on public.company_checks (company_id, checked_at desc);

alter table public.company_checks enable row level security;
-- A company sees its own check results (not the raw evidence).
create policy "read own checks" on public.company_checks
  for select to authenticated using (company_id = public.my_company_id());
revoke all on public.company_checks from authenticated, anon;
grant select (id, company_id, kind, outcome, reason, findings, checked_at) on public.company_checks to authenticated;

-- KBO open data ---------------------------------------------------------------
-- Loaded monthly from the BCE/KBO open data files (scripts/import-kbo.mjs).

create table public.kbo_enterprises (
  enterprise_number text primary key check (enterprise_number ~ '^[01][0-9]{9}$'),
  status text not null,
  juridical_form text,
  start_date date,
  name text,
  nace_codes text[] not null default '{}',
  imported_at timestamptz not null default now()
);
alter table public.kbo_enterprises enable row level security;
revoke all on public.kbo_enterprises from authenticated, anon;

-- Agreements between contractors -----------------------------------------------
-- The client (donneur d'ordre) proposes; the subcontractor accepts; checks run on
-- both, fresh. If the subcontractor has social or tax debts the client must
-- confirm they will withhold the legal share of each invoice before it is confirmed.

create type public.agreement_status as enum ('proposed', 'awaiting_retention_ack', 'confirmed', 'blocked', 'cancelled');

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.companies,
  subcontractor_id uuid not null references public.companies,
  title text not null check (length(trim(title)) > 2),
  description text,
  amount_ex_vat numeric(12, 2) check (amount_ex_vat >= 0),
  starts_on date,
  status public.agreement_status not null default 'proposed',
  -- Set by the server from the checks run at acceptance.
  blocked_findings text[] not null default '{}',
  retention_social_pct numeric(5, 2) not null default 0,
  retention_tax_pct numeric(5, 2) not null default 0,
  subcontractor_accepted_at timestamptz,
  retention_acknowledged_at timestamptz,
  checked_at timestamptz,
  confirmed_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  check (client_id <> subcontractor_id)
);
create index agreements_client_idx on public.agreements (client_id, created_at desc);
create index agreements_subcontractor_idx on public.agreements (subcontractor_id, created_at desc);

alter table public.agreements enable row level security;
create policy "parties read their agreements" on public.agreements
  for select to authenticated using (public.my_company_id() in (client_id, subcontractor_id));
-- The client proposes. Every later step goes through the accept-agreement function.
create policy "clients propose agreements" on public.agreements
  for insert to authenticated with check (client_id = public.my_company_id() and status = 'proposed');
create policy "clients cancel open agreements" on public.agreements
  for update to authenticated
  using (client_id = public.my_company_id() and status in ('proposed', 'awaiting_retention_ack', 'blocked'))
  with check (status = 'cancelled');

revoke all on public.agreements from authenticated, anon;
grant select on public.agreements to authenticated;
grant insert (client_id, subcontractor_id, title, description, amount_ex_vat, starts_on) on public.agreements to authenticated;
grant update (status) on public.agreements to authenticated;

alter table public.company_checks
  add constraint company_checks_agreement_fk foreign key (agreement_id) references public.agreements on delete set null;
