-- What the supplier actually offers on a line (their packaging and unit price), and how it
-- differs from what was asked (thickness, size, grade), read by Nodi from their PDF.
alter table public.quote_items add column if not exists offered text check (char_length(offered) <= 200);
alter table public.quote_items add column if not exists mismatch text check (char_length(mismatch) <= 300);
