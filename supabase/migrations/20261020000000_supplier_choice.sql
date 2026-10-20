-- Who chose the suppliers of a request: the contractor, or BatiNode (5 suppliers of the region).
alter table public.price_requests
  add column if not exists supplier_choice text not null default 'own' check (supplier_choice in ('own', 'batinode'));
