-- Collaboration network: contractors post work they want to subcontract and
-- architects post their projects; verified contractors answer; the author picks
-- one and an agreement is confirmed after a fresh register check (see
-- 20261018010000_verification_and_agreements.sql).

-- Trades (lots) ----------------------------------------------------------------

create table public.trades (
  id smallint primary key,
  slug text not null unique,
  label_fr text not null,
  label_nl text not null
);
insert into public.trades (id, slug, label_fr, label_nl) values
  (1, 'shell', 'Gros œuvre', 'Ruwbouw'),
  (2, 'roofing', 'Toiture', 'Dakwerken'),
  (3, 'carpentry', 'Menuiserie', 'Schrijnwerk'),
  (4, 'electrical', 'Électricité', 'Elektriciteit'),
  (5, 'plumbing', 'Sanitaire', 'Sanitair'),
  (6, 'hvac', 'Chauffage et ventilation', 'Verwarming en ventilatie'),
  (7, 'insulation', 'Isolation', 'Isolatie'),
  (8, 'plastering', 'Plafonnage', 'Pleisterwerk'),
  (9, 'flooring', 'Carrelage et chapes', 'Tegelwerk en dekvloeren'),
  (10, 'painting', 'Peinture', 'Schilderwerk'),
  (11, 'facade', 'Façade', 'Gevelwerken'),
  (12, 'groundworks', 'Terrassement', 'Grondwerken'),
  (13, 'demolition', 'Démolition', 'Afbraak'),
  (14, 'general', 'Entreprise générale', 'Algemene aanneming');
alter table public.trades enable row level security;
create policy "trades are public" on public.trades for select to anon, authenticated using (true);

-- Which trades a contractor does, and where (postal prefix as for suppliers).
create table public.company_trades (
  company_id uuid not null references public.companies on delete cascade,
  trade_id smallint not null references public.trades,
  primary key (company_id, trade_id)
);
alter table public.company_trades enable row level security;
create policy "trades of companies are visible" on public.company_trades for select to authenticated using (true);
create policy "companies set their trades" on public.company_trades
  for all to authenticated using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

-- Plan helper --------------------------------------------------------------------

-- Architects use the network for free (they bring the projects). Contractors on
-- the free plan can read posts; Pro and Complet can post and answer. A company the
-- registers rejected cannot take part; agreements need a fresh, clean check anyway.
create function public.can_use_network() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    left join public.subscriptions s on s.company_id = c.id and s.status = 'active'
    where c.id = public.my_company_id()
      and c.verification_status <> 'rejected'
      and (c.kind = 'architect' or (c.kind = 'contractor' and s.plan in ('pro', 'full')))
  )
$$;

-- Posts ----------------------------------------------------------------------------

create type public.opportunity_kind as enum ('subcontract', 'architect_project');
create type public.opportunity_status as enum ('open', 'closed', 'awarded');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  kind public.opportunity_kind not null,
  title text not null check (length(trim(title)) > 2),
  description text not null check (length(trim(description)) > 10),
  trade_ids smallint[] not null check (cardinality(trade_ids) between 1 and 6),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{3}$'),
  city text,
  starts_on date,
  budget_ex_vat numeric(12, 2) check (budget_ex_vat >= 0),
  status public.opportunity_status not null default 'open',
  created_at timestamptz not null default now()
);
create index opportunities_open_idx on public.opportunities (created_at desc) where status = 'open';
create index opportunities_company_idx on public.opportunities (company_id, created_at desc);
create index opportunities_trades_idx on public.opportunities using gin (trade_ids);

alter table public.opportunities enable row level security;
create policy "signed-in companies read posts" on public.opportunities
  for select to authenticated using (status = 'open' or company_id = public.my_company_id());
-- The kind follows the author: architects post projects, contractors subcontract work.
create policy "network members post" on public.opportunities
  for insert to authenticated
  with check (
    company_id = public.my_company_id()
    and public.can_use_network()
    and kind = (case (select c.kind from public.companies c where c.id = public.my_company_id())
                  when 'architect' then 'architect_project' else 'subcontract' end)::public.opportunity_kind
  );
create policy "authors edit their posts" on public.opportunities
  for update to authenticated using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

-- Answers --------------------------------------------------------------------------

create type public.response_status as enum ('sent', 'shortlisted', 'declined', 'selected');

create table public.opportunity_responses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities on delete cascade,
  company_id uuid not null references public.companies on delete cascade,
  message text not null check (length(trim(message)) between 10 and 4000),
  status public.response_status not null default 'sent',
  created_at timestamptz not null default now(),
  unique (opportunity_id, company_id)
);
create index opportunity_responses_company_idx on public.opportunity_responses (company_id, created_at desc);

alter table public.opportunity_responses enable row level security;
create policy "responder and author read answers" on public.opportunity_responses
  for select to authenticated using (
    company_id = public.my_company_id()
    or exists (select 1 from public.opportunities o where o.id = opportunity_id and o.company_id = public.my_company_id())
  );
-- Only contractors answer, on a plan with network access, to someone else's open post.
create policy "contractors answer open posts" on public.opportunity_responses
  for insert to authenticated with check (
    company_id = public.my_company_id()
    and public.can_use_network()
    and exists (select 1 from public.companies c where c.id = opportunity_responses.company_id and c.kind = 'contractor')
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_responses.opportunity_id and o.status = 'open' and o.company_id <> opportunity_responses.company_id
    )
  );
-- The author shortlists or declines; selection goes through an agreement.
create policy "authors sort answers" on public.opportunity_responses
  for update to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id and o.company_id = public.my_company_id()))
  with check (status in ('shortlisted', 'declined'));

revoke all on public.opportunity_responses from authenticated, anon;
grant select on public.opportunity_responses to authenticated;
grant insert (opportunity_id, company_id, message) on public.opportunity_responses to authenticated;
grant update (status) on public.opportunity_responses to authenticated;

revoke all on public.opportunities from authenticated, anon;
grant select on public.opportunities to authenticated;
grant insert (company_id, kind, title, description, trade_ids, postal_code, city, starts_on, budget_ex_vat)
  on public.opportunities to authenticated;
grant update (title, description, trade_ids, starts_on, budget_ex_vat, status) on public.opportunities to authenticated;

-- Agreements come from a post and an answer ----------------------------------------

-- subcontract: the client pays the subcontractor, so 30bis withholding applies.
-- referral: an architect puts a contractor forward for their client's project;
--           the contractor is checked the same way, debts are flagged, not acknowledged.
create type public.agreement_kind as enum ('subcontract', 'referral');
alter table public.agreements
  add column kind public.agreement_kind not null default 'subcontract',
  add column opportunity_id uuid references public.opportunities on delete set null,
  add column response_id uuid references public.opportunity_responses on delete set null;
create unique index agreements_response_idx on public.agreements (response_id) where status <> 'cancelled';

-- The author proposes an agreement to a company that answered their post.
drop policy "clients propose agreements" on public.agreements;
create policy "authors propose agreements to who answered" on public.agreements
  for insert to authenticated with check (
    client_id = public.my_company_id()
    and status = 'proposed'
    and exists (
      select 1 from public.opportunity_responses r
      join public.opportunities o on o.id = r.opportunity_id
      where r.id = response_id and o.id = opportunity_id and o.company_id = client_id and r.company_id = subcontractor_id
    )
    and agreements.kind = (
      case (select o.kind from public.opportunities o where o.id = agreements.opportunity_id)
        when 'architect_project' then 'referral' else 'subcontract' end
    )::public.agreement_kind
  );
grant insert (kind, opportunity_id, response_id) on public.agreements to authenticated;

-- Contact details are shared once an agreement is confirmed (or for a referral, accepted).
create function public.agreement_contacts(p_agreement_id uuid)
returns table (company_id uuid, name text, email text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.email
  from public.agreements a
  join public.companies c on c.id in (a.client_id, a.subcontractor_id)
  where a.id = p_agreement_id
    and a.status = 'confirmed'
    and public.my_company_id() in (a.client_id, a.subcontractor_id)
$$;

-- Sign-up for contractors and architects ----------------------------------------

create function public.create_company(
  p_kind public.company_kind, p_name text, p_vat text, p_postal_code text, p_city text, p_language public.app_language
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_kind not in ('contractor', 'architect') then
    raise exception 'suppliers are invited';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and company_id is not null) then
    raise exception 'company already created';
  end if;
  insert into public.companies (kind, name, vat_number, postal_code, city, language, email)
  values (p_kind, trim(p_name), upper(replace(replace(p_vat, '.', ''), ' ', '')), p_postal_code, p_city, p_language,
          (select email from auth.users where id = auth.uid()))
  returning id into cid;
  insert into public.profiles (id, company_id, language) values (auth.uid(), cid, p_language)
  on conflict (id) do update set company_id = excluded.company_id, language = excluded.language;
  insert into public.subscriptions (company_id) values (cid);
  return cid;
end $$;
