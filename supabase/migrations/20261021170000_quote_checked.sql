-- When Nodi last compared the supplier's PDF with the request (materials, sizes),
-- so offers sent before the check existed are checked once.
alter table public.quotes add column checked_at timestamptz;
