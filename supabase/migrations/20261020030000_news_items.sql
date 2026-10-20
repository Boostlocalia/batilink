-- Building news shown in the home carousel, announced by Nodi. The news-daily job
-- (pg_cron, 6:30 Brussels time, retried at 13:00) writes 5 items a day from a web search; nobody approves
-- them by hand. Signed-in users read them; only the service role writes.
create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  published_on date not null default current_date,
  topic text not null check (topic in ('ecology', 'regulation', 'grants', 'products', 'market', 'safety')),
  title_fr text not null check (char_length(title_fr) between 1 and 90),
  text_fr text not null check (char_length(text_fr) between 1 and 260),
  title_nl text not null check (char_length(title_nl) between 1 and 90),
  text_nl text not null check (char_length(text_nl) between 1 and 260),
  source_name text not null check (char_length(source_name) between 1 and 80),
  source_url text not null check (source_url ~ '^https://[^\s<>"]+$' and char_length(source_url) <= 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_url)
);
create index news_items_recent on public.news_items (published_on desc);

alter table public.news_items enable row level security;
create policy "signed-in users read visible news" on public.news_items
  for select to authenticated using (not hidden);
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to authenticated;

-- UTC times: about 6:30 and 13:00 in Brussels. The second run only tops up a short day.
select cron.schedule('news-daily', '30 4 * * *', $$select public.call_job('news-daily')$$);
select cron.schedule('news-daily-retry', '0 11 * * *', $$select public.call_job('news-daily')$$);
