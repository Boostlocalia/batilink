-- "New" on the home tile: suppliers who answered (prices, PDF or a message)
-- since the contractor last opened the request.

alter table public.quotes add column offer_received_at timestamptz;
alter table public.price_requests add column seen_at timestamptz;

create function public.stamp_offer_received() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.offer_file_path is not null and old.offer_file_path is null)
     or (new.status = 'submitted' and old.status is distinct from 'submitted') then
    new.offer_received_at := now();
  end if;
  return new;
end $$;

create trigger quotes_offer_received before update on public.quotes
  for each row execute function public.stamp_offer_received();

-- What exists today counts as seen.
update public.quotes set offer_received_at = coalesce(submitted_at, now())
  where offer_file_path is not null or status <> 'invited';
update public.price_requests set seen_at = now();

-- Number of suppliers with news on the caller's open requests.
create function public.my_unseen_offers() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.quotes q
  join public.price_requests r on r.id = q.request_id
  where r.company_id = public.my_company_id()
    and r.status = 'sent'
    and q.status <> 'declined'
    and greatest(
          q.offer_received_at,
          (select max(m.relayed_at) from public.quote_messages m where m.quote_id = q.id and m.author = 'supplier')
        ) > coalesce(r.seen_at, '-infinity'::timestamptz)
$$;

create function public.mark_request_seen(rid uuid) returns void
language sql security definer set search_path = public as $$
  update public.price_requests set seen_at = now() where id = rid and company_id = public.my_company_id()
$$;

revoke execute on function public.my_unseen_offers(), public.mark_request_seen(uuid), public.stamp_offer_received() from public, anon;
grant execute on function public.my_unseen_offers(), public.mark_request_seen(uuid) to authenticated;
