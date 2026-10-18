-- Files space for contractors, suppliers and architects: price lists, bills of
-- quantities, plans. Each company only sees its own files. A spreadsheet can be
-- turned into a price request in the app.

create table public.company_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  -- '<company id>/<random>-<name>' in the private `company-files` bucket.
  storage_path text not null unique,
  name text not null check (length(name) between 1 and 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = company_id::text)
);
create index company_files_company_idx on public.company_files (company_id, created_at desc);
create index company_files_uploaded_by_idx on public.company_files (uploaded_by);

alter table public.company_files enable row level security;
create policy "companies read own files" on public.company_files
  for select to authenticated using (company_id = (select public.my_company_id()));
create policy "companies add own files" on public.company_files
  for insert to authenticated with check (company_id = (select public.my_company_id()));
create policy "companies remove own files" on public.company_files
  for delete to authenticated using (company_id = (select public.my_company_id()));
revoke all on public.company_files from authenticated, anon;
grant select, delete on public.company_files to authenticated;
grant insert (company_id, storage_path, name, content_type, size_bytes) on public.company_files to authenticated;

-- Private bucket; a company reads and writes only under its own folder.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('company-files', 'company-files', false, 20971520, array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv', 'text/comma-separated-values', 'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic'
    ])
    on conflict (id) do nothing;

    execute $p$
      create policy "companies read own folder" on storage.objects for select to authenticated
      using (bucket_id = 'company-files' and (storage.foldername(name))[1] = (select public.my_company_id())::text)
    $p$;
    execute $p$
      create policy "companies upload to own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'company-files' and (storage.foldername(name))[1] = (select public.my_company_id())::text)
    $p$;
    execute $p$
      create policy "companies remove from own folder" on storage.objects for delete to authenticated
      using (bucket_id = 'company-files' and (storage.foldername(name))[1] = (select public.my_company_id())::text)
    $p$;
  end if;
end $$;
