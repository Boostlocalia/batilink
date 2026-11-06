-- Agreements in the entrepreneurs' network can also be a partnership, next to subcontracting.
alter table public.conversations drop constraint conversations_deal_kind_check;
alter table public.conversations add constraint conversations_deal_kind_check
  check (deal_kind in ('subcontract', 'partnership', 'shared_site', 'equipment', 'other'));
