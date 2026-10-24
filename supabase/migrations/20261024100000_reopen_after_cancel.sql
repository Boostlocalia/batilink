-- A cancelled order gives the choice back: the same offer may be ordered again later,
-- so only one live (not cancelled) order per offer.
alter table public.purchase_orders drop constraint if exists purchase_orders_quote_id_key;
create unique index if not exists purchase_orders_live_quote_key on public.purchase_orders (quote_id) where status <> 'cancelled';

-- Commissions follow the order, not the offer.
alter table public.commissions drop constraint if exists commissions_quote_id_key;

-- Requests whose order was cancelled before this fix: open the choice again.
with c as (
  select po.request_id, po.quote_id, po.cancel_reason from public.purchase_orders po
  join public.price_requests r on r.id = po.request_id
  where po.status = 'cancelled' and r.status = 'awarded'
    and not exists (select 1 from public.purchase_orders o2 where o2.request_id = po.request_id and o2.status <> 'cancelled')
), r as (
  update public.price_requests p set status = 'sent' from c where p.id = c.request_id returning p.id
), a as (
  update public.quotes q set status = case when c.cancel_reason = 'supplier_declined' then 'declined'::quote_status else 'submitted'::quote_status end
  from c where q.id = c.quote_id and q.status = 'awarded' returning q.id
)
update public.quotes q set status = case when q.submitted_at is not null then 'submitted'::quote_status else 'invited'::quote_status end
from c where q.request_id = c.request_id and q.status = 'not_selected';
