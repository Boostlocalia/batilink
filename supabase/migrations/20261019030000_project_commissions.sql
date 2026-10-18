-- Architects publish projects for free. When a subscribed contractor (Starter or
-- Premium) confirms a project with the architect, BatiLink bills a 5 % commission
-- on the agreed amount, on the payer's monthly commission bill. Who pays is set in
-- supabase/functions/_shared/project-commission.ts.

-- The commission needs an amount: an architect's project carries its budget, and
-- the agreement that puts a contractor forward carries the amount.
alter table public.opportunities
  add constraint architect_project_budget check (kind <> 'architect_project' or coalesce(budget_ex_vat, 0) > 0) not valid;
alter table public.agreements
  add constraint referral_amount check (kind <> 'referral' or coalesce(amount_ex_vat, 0) > 0) not valid;

create table public.project_commissions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null unique references public.agreements on delete restrict,
  payer_id uuid not null references public.companies on delete restrict,
  architect_id uuid not null references public.companies on delete restrict,
  contractor_id uuid not null references public.companies on delete restrict,
  base_ex_vat numeric(14, 2) not null check (base_ex_vat > 0),
  rate numeric(5, 4) not null,
  amount_ex_vat numeric(14, 2) not null check (amount_ex_vat >= 0),
  status public.commission_status not null default 'pending',
  confirmed_at timestamptz not null default now(),
  bill_id uuid references public.commission_bills on delete restrict,
  invoiced_at timestamptz,
  paid_at timestamptz
);
create index project_commissions_due_idx on public.project_commissions (payer_id, confirmed_at) where status = 'pending';

-- Back office only, like supplier commissions.
alter table public.project_commissions enable row level security;
revoke all on public.project_commissions from anon, authenticated;

-- A bill now goes to whoever owes commission (a supplier, or the payer of a project
-- commission); the column keeps its name.
comment on column public.commission_bills.supplier_id is 'Company billed: a supplier, or the payer of a project commission.';
