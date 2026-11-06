-- A third way to pick suppliers: the contractor's own, completed by BatiNode up to 5.
alter table public.price_requests drop constraint if exists price_requests_supplier_choice_check;
alter table public.price_requests add constraint price_requests_supplier_choice_check check (supplier_choice in ('own', 'batinode', 'mix'));
