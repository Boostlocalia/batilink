-- Security review, 2026-10-19.

-- A member could point their profile at any company and act as it: profiles
-- only take a name and a language from the app. Companies are linked by create_company().
revoke insert, update on public.profiles from authenticated, anon;
grant update (full_name, language) on public.profiles to authenticated;

-- The API never needs these, and TRUNCATE ignores row level security.
do $$ declare r record; begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- A logo can only be a file of this project's logos bucket, in the company's folder layout.
alter table public.companies drop constraint if exists companies_logo_url_check;
alter table public.companies add constraint companies_logo_url_check
  check (logo_url ~ '^https://bkmzstdviytslegbxsax\.supabase\.co/storage/v1/object/public/logos/[0-9a-f-]{36}/logo-[a-z0-9]+\.(png|jpg|webp)$');
