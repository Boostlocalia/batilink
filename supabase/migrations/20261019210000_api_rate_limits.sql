-- Calls to costly endpoints (the AI assistant), counted per caller to cap abuse.
-- Written by the edge functions only.
create table public.api_calls (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index api_calls_key_idx on public.api_calls (key, created_at desc);
alter table public.api_calls enable row level security;
revoke all on public.api_calls from anon, authenticated;
