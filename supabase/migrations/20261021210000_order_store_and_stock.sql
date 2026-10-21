-- After the client picks an offer: the supplier gives the exact store address (it can be a
-- branch, not the head office) and says whether everything is in stock. When it is not,
-- the supplier tells the client later that the goods arrived (ready_at). The client sees
-- the store's address and phone through order_supplier_contact(), only for their own orders.

alter table public.purchase_orders
  add column store_address text check (char_length(store_address) <= 300),
  add column in_stock boolean,
  add column ready_at timestamptz;

grant select (store_address, in_stock, ready_at) on public.purchase_orders to authenticated;

create or replace function public.order_supplier_contact(p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', c.name,
    'address', coalesce(nullif(o.store_address, ''), nullif(concat_ws(', ', nullif(c.street, ''), nullif(concat_ws(' ', c.postal_code, c.city), '')), '')),
    'phone', nullif(c.phone, '')
  )
  from public.purchase_orders o join public.companies c on c.id = o.supplier_id
  where o.id = p_order and o.contractor_id = public.my_company_id() and o.status <> 'cancelled'
$$;

revoke execute on function public.order_supplier_contact(uuid) from public, anon;
grant execute on function public.order_supplier_contact(uuid) to authenticated;
