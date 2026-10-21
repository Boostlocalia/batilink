-- An offer whose product differs from the request (glass wool instead of stone wool):
-- BatiNode asks the supplier to correct it (twice at most) and tells the client.
-- correction_requested_at is set while a correction is awaited.
alter table public.quotes add column correction_requested_at timestamptz;
alter table public.quotes add column corrections smallint not null default 0;
grant select (correction_requested_at) on public.quotes to authenticated;
