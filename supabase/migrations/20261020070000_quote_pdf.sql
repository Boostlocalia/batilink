-- A supplier can attach their own quote as a PDF on the offer page. Nodi reads it
-- and fills in the prices; the contractor can open the PDF next to the offer.
alter table public.quotes add column offer_file_path text;
alter table public.quotes add column offer_reads smallint not null default 0;
grant select (offer_file_path) on public.quotes to authenticated;

-- Private bucket written only by the supplier-quote function (service role).
-- The contractor who owns the request reads the files of its quotes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-files', 'quote-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "contractors read offer files of own requests" on storage.objects for select to authenticated
using (
  bucket_id = 'quote-files'
  and exists (
    select 1 from public.quotes q
    where q.id::text = (storage.foldername(name))[1] and public.owns_request(q.request_id)
  )
);
