-- The sign-in e-mails (confirmation, password reset) are written by Supabase Auth,
-- which only sees the user's metadata: keep the chosen language there too.
create or replace function public.sync_auth_language()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('language', new.language::text)
   where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_auth_language() from public, anon, authenticated;

create trigger profiles_sync_auth_language
  after insert or update of language on public.profiles
  for each row execute function public.sync_auth_language();

-- Existing accounts.
update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('language', p.language::text)
  from public.profiles p
 where p.id = u.id;
