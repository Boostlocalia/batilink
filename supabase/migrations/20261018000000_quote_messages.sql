-- Questions and answers between a supplier and the contractor about one quote.
-- Suppliers ask by replying to the invitation e-mail; an AI step reads the e-mail
-- and relays it to the contractor in their language, and the answer goes back the
-- same way. Neither side sees the other's e-mail address: replies go to per-quote
-- relay addresses, s-<reply_key>@… (supplier writes) and c-<reply_key>@… (contractor writes).

-- 122 random bits; existing rows get one too. Not granted to the app.
alter table public.quotes
  add column reply_key text not null unique default replace(gen_random_uuid()::text, '-', '');

create type public.message_author as enum ('supplier', 'contractor');
create type public.message_channel as enum ('email', 'app');
-- What the AI step understood. Only question/answer/info are relayed;
-- the rest is kept for the back office.
create type public.message_kind as enum ('question', 'answer', 'info', 'auto_reply', 'off_topic');

create table public.quote_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes on delete cascade,
  request_id uuid not null references public.price_requests on delete cascade,
  author public.message_author not null,
  channel public.message_channel not null,
  kind public.message_kind not null,
  -- What the author wrote (e-mail body without quoted history or signature).
  body text not null check (length(body) between 1 and 20000),
  -- What the recipient received, in their language. Null when not relayed.
  relayed_body text,
  -- Short French/Dutch labels of the request lines the message is about.
  item_labels text[] not null default '{}',
  sender_email text,
  -- E-mail Message-ID, so a webhook retried by the mail provider is stored once.
  source_message_id text unique,
  relayed_at timestamptz,
  created_at timestamptz not null default now()
);
create index quote_messages_quote_idx on public.quote_messages (quote_id, created_at);
create index quote_messages_request_idx on public.quote_messages (request_id, created_at);

alter table public.quote_messages enable row level security;

-- The contractor reads every message on their own requests. Writes go through
-- edge functions (they relay by e-mail), so users get no insert/update rights.
create policy "read messages on own requests" on public.quote_messages
  for select to authenticated using (public.owns_request(request_id));

revoke all on public.quote_messages from authenticated, anon;
grant select (id, quote_id, request_id, author, channel, kind, body, relayed_body, item_labels, relayed_at, created_at)
  on public.quote_messages to authenticated;
