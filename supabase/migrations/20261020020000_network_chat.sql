-- Direct messages between two network companies (contractors and architects).
-- A first message is a contact request the other company accepts, declines or
-- blocks. Once both confirm a deal, it counts in the platform's contact figures.
-- Companies only read their own conversations; every write goes through the
-- `chat` edge function, which checks who may do what.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- The pair, stored in a fixed order so a pair has one conversation only.
  company_a uuid not null references public.companies on delete cascade,
  company_b uuid not null references public.companies on delete cascade,
  started_by uuid not null references public.companies on delete cascade,
  opportunity_id uuid references public.opportunities on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  blocked_by uuid references public.companies on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_message_at timestamptz not null default now(),
  a_read_at timestamptz,
  b_read_at timestamptz,
  a_notified_at timestamptz,
  b_notified_at timestamptz,
  -- Deal: each side confirms; it counts once both have.
  a_deal_at timestamptz,
  b_deal_at timestamptz,
  deal_kind text check (deal_kind in ('subcontract', 'shared_site', 'equipment', 'other')),
  deal_amount_ex_vat numeric(12, 2) check (deal_amount_ex_vat is null or deal_amount_ex_vat between 0 and 100000000),
  deal_note text check (deal_note is null or length(deal_note) <= 500),
  deal_confirmed_at timestamptz,
  check (company_a < company_b),
  check (started_by in (company_a, company_b)),
  unique (company_a, company_b)
);
create index conversations_a_idx on public.conversations (company_a, last_message_at desc);
create index conversations_b_idx on public.conversations (company_b, last_message_at desc);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  author_company uuid not null references public.companies on delete cascade,
  author_user uuid references auth.users on delete set null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index conversation_messages_idx on public.conversation_messages (conversation_id, created_at);

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  reporter uuid not null references public.companies on delete cascade,
  reason text check (reason is null or length(reason) <= 1000),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reports enable row level security;

create policy "companies read their conversations" on public.conversations
  for select to authenticated using (public.my_company_id() in (company_a, company_b));
create policy "companies read their messages" on public.conversation_messages
  for select to authenticated using (
    exists (select 1 from public.conversations c where c.id = conversation_id and public.my_company_id() in (c.company_a, c.company_b))
  );

revoke all on public.conversations, public.conversation_messages, public.conversation_reports from anon, authenticated;
grant select on public.conversations, public.conversation_messages to authenticated;
