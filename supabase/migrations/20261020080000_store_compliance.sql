-- What the App Store and Google Play require of an app with accounts and user content:
-- deleting one's account from inside the app, and reporting a post in the network.

-- A deleted company keeps the rows its partners need for their accounting (orders,
-- commissions), stripped of contact details; it disappears from every list.
alter table public.companies add column deleted_at timestamptz;

-- A user who created an agreement can still delete their account.
alter table public.agreements drop constraint agreements_created_by_fkey;
alter table public.agreements
  add constraint agreements_created_by_fkey foreign key (created_by) references auth.users on delete set null;

create table public.opportunity_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities on delete cascade,
  reporter uuid not null default public.my_company_id() references public.companies on delete cascade,
  reason text check (reason is null or length(reason) <= 1000),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  unique (opportunity_id, reporter)
);
create index opportunity_reports_open_idx on public.opportunity_reports (created_at desc) where handled_at is null;
create index opportunity_reports_reporter_idx on public.opportunity_reports (reporter);

alter table public.opportunity_reports enable row level security;
-- A company reports someone else's post, once; the BatiNode team reads them through the admin function.
create policy "companies report others' posts" on public.opportunity_reports
  for insert to authenticated
  with check (
    reporter = (select public.my_company_id())
    and not exists (select 1 from public.opportunities o where o.id = opportunity_id and o.company_id = (select public.my_company_id()))
  );
revoke all on public.opportunity_reports from anon, authenticated;
grant insert (opportunity_id, reason) on public.opportunity_reports to authenticated;
