-- A company's profile picture or logo, shown next to its name across the app.
-- Public bucket: anyone with the link sees it; each company writes only its own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "companies upload their logo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select public.my_company_id())::text);
create policy "companies remove their logo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select public.my_company_id())::text);

alter table public.companies add column logo_url text check (logo_url ~ '^https://[a-z0-9.-]+/storage/v1/object/public/logos/');
grant select (logo_url), update (logo_url) on public.companies to authenticated;
-- Removing a file reads it first.
create policy "companies list their logo" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select public.my_company_id())::text);
