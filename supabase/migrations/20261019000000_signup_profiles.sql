-- Sign-up by profile: contractors, suppliers and architects answer questions that
-- fit their trade. Suppliers can now sign up themselves (they were only invited).

-- Belgian provinces as postal-code prefixes ---------------------------------------

create function public.region_prefixes(p_region text) returns text[]
language sql immutable as $$
  select case p_region
    when 'BRU' then array['10', '11', '12']
    when 'BW'  then array['13', '14']
    when 'VB'  then array['15', '16', '17', '18', '19', '30', '31', '32', '33', '34']
    when 'ANT' then array['2']
    when 'LIM' then array['35', '36', '37', '38', '39']
    when 'LIE' then array['4']
    when 'NAM' then array['5']
    when 'HAI' then array['60', '61', '62', '63', '64', '65', '7']
    when 'LUX' then array['66', '67', '68', '69']
    when 'WVL' then array['8']
    when 'OVL' then array['9']
  end
$$;

-- Profile answers ------------------------------------------------------------------

alter table public.companies
  -- Everyone
  add column street text check (length(street) <= 200),
  add column contact_name text check (length(contact_name) <= 120),
  add column phone text check (phone ~ '^\+?[0-9 ./-]{8,20}$'),
  add column website text check (length(website) <= 200),
  add column team_size text check (team_size in ('1', '2-5', '6-20', '21-50', '50+')),
  add column regions text[] not null default '{}'
    check (regions <@ array['BRU', 'BW', 'VB', 'ANT', 'LIM', 'LIE', 'NAM', 'HAI', 'LUX', 'WVL', 'OVL']),
  add column heard_from text check (heard_from in ('search', 'supplier', 'colleague', 'federation', 'social', 'fair', 'accountant', 'other')),
  add column referral_code text unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column referred_by uuid references public.companies on delete set null,
  add column terms_accepted_at timestamptz,
  add column terms_version text,
  -- Contractors
  add column work_types text[] not null default '{}'
    check (work_types <@ array['new_build', 'renovation', 'maintenance', 'finishing', 'energy']),
  add column client_types text[] not null default '{}'
    check (client_types <@ array['private', 'professional', 'public']),
  add column monthly_purchases text check (monthly_purchases in ('lt5k', '5-20k', '20-50k', 'gt50k')),
  -- Suppliers
  add column supplier_type text check (supplier_type in ('merchant', 'manufacturer', 'wholesaler', 'rental')),
  add column quote_email text check (quote_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  add column delivers boolean,
  add column pickup boolean,
  add column min_order_ex_vat numeric(12, 2) check (min_order_ex_vat >= 0),
  add column peppol boolean,
  add column commission_accepted_at timestamptz,
  -- Architects
  add column architect_number text check (length(architect_number) <= 30),
  add column project_types text[] not null default '{}'
    check (project_types <@ array['house', 'renovation', 'collective', 'tertiary', 'public']),
  add column projects_per_year text check (projects_per_year in ('lt5', '5-15', '15-40', 'gt40'));

-- Existing companies keep a referral code.
update public.companies set referral_code = upper(substr(md5(gen_random_uuid()::text), 1, 8)) where referral_code is null;

-- Others may see what helps them pick a partner; contact details, purchase volumes
-- and commercial terms stay private (read through my_company_profile()).
grant select (website, team_size, regions, work_types, client_types, supplier_type, delivers, pickup, project_types)
  on public.companies to authenticated;
grant update (street, contact_name, phone, website, team_size, regions, work_types, client_types, monthly_purchases,
              quote_email, delivers, pickup, min_order_ex_vat, peppol, project_types, projects_per_year)
  on public.companies to authenticated;

create function public.my_company_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'commission_rate' - 'stripe_customer_id'
    || jsonb_build_object(
         'trades', coalesce((select jsonb_agg(trade_id) from public.company_trades where company_id = c.id), '[]'),
         'categories', coalesce((select jsonb_agg(distinct category_id) from public.supplier_coverage where supplier_id = c.id), '[]'))
  from public.companies c
  where c.id = public.my_company_id()
$$;
revoke all on function public.my_company_profile() from public, anon;
grant execute on function public.my_company_profile() to authenticated;

-- Name from the BCE/KBO open data, to pre-fill the form.
create function public.lookup_company(p_vat text) returns table (name text, status text, start_date date)
language sql stable security definer set search_path = public as $$
  select k.name, k.status, k.start_date
  from public.kbo_enterprises k
  where k.enterprise_number = substr(upper(replace(replace(p_vat, '.', ''), ' ', '')), 3)
    and auth.uid() is not null
$$;
revoke all on function public.lookup_company(text) from public, anon;
grant execute on function public.lookup_company(text) to authenticated;

-- A supplier's coverage follows its categories and provinces.
create function public.set_supplier_coverage(p_categories smallint[], p_regions text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company_id();
begin
  if cid is null or not exists (select 1 from public.companies where id = cid and kind = 'supplier') then
    raise exception 'not a supplier';
  end if;
  if coalesce(array_length(p_categories, 1), 0) = 0 or coalesce(array_length(p_regions, 1), 0) = 0 then
    raise exception 'coverage required';
  end if;
  update public.companies set regions = p_regions where id = cid;
  delete from public.supplier_coverage where supplier_id = cid;
  insert into public.supplier_coverage (supplier_id, category_id, postal_prefix)
  select distinct cid, cat, prefix
  from unnest(p_categories) cat
  cross join lateral unnest(p_regions) r
  cross join lateral unnest(public.region_prefixes(r)) prefix
  where exists (select 1 from public.categories where id = cat);
end $$;
revoke all on function public.set_supplier_coverage(smallint[], text[]) from public, anon;
grant execute on function public.set_supplier_coverage(smallint[], text[]) to authenticated;

-- Sign-up ----------------------------------------------------------------------------

drop function public.create_company(public.company_kind, text, text, text, text, public.app_language);

create function public.create_company(
  p_kind public.company_kind, p_name text, p_vat text, p_postal_code text, p_city text, p_language public.app_language,
  p_profile jsonb default '{}', p_trades smallint[] default '{}', p_categories smallint[] default '{}', p_referral text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  v_vat text := upper(replace(replace(p_vat, '.', ''), ' ', ''));
  v_email text := (select u.email from auth.users u where u.id = auth.uid());
  v_regions text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_profile -> 'regions') x), '{}');
  arr text[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and company_id is not null) then
    raise exception 'company already created';
  end if;
  if coalesce((p_profile ->> 'terms')::boolean, false) is not true then
    raise exception 'terms_required';
  end if;
  if coalesce(array_length(v_regions, 1), 0) = 0 then
    raise exception 'regions_required';
  end if;
  if p_kind = 'contractor' and coalesce(array_length(p_trades, 1), 0) = 0 then
    raise exception 'trades_required';
  end if;
  if p_kind = 'supplier' then
    if coalesce(array_length(p_categories, 1), 0) = 0 then raise exception 'categories_required'; end if;
    if coalesce((p_profile ->> 'commission')::boolean, false) is not true then raise exception 'commission_required'; end if;
  end if;

  -- A supplier BatiLink already invited claims its company with the address the
  -- requests were sent to (proven by the sign-in code). Anyone else gets vat_taken.
  select id into cid from public.companies where vat_number = v_vat;
  if cid is not null then
    if p_kind = 'supplier'
       and exists (select 1 from public.companies where id = cid and kind = 'supplier' and lower(companies.email) = lower(v_email))
       and not exists (select 1 from public.profiles where company_id = cid) then
      null;
    else
      raise exception 'vat_taken';
    end if;
  else
    insert into public.companies (kind, name, vat_number, postal_code, city, language, email)
    values (p_kind, trim(p_name), v_vat, p_postal_code, p_city, p_language, v_email)
    returning id into cid;
  end if;

  update public.companies set
    name = trim(p_name),
    postal_code = p_postal_code,
    city = p_city,
    street = nullif(trim(p_profile ->> 'street'), ''),
    contact_name = nullif(trim(p_profile ->> 'contact_name'), ''),
    phone = nullif(trim(p_profile ->> 'phone'), ''),
    website = nullif(trim(p_profile ->> 'website'), ''),
    team_size = p_profile ->> 'team_size',
    regions = v_regions,
    heard_from = p_profile ->> 'heard_from',
    terms_accepted_at = now(),
    terms_version = coalesce(p_profile ->> 'terms_version', '2026-10'),
    referred_by = (select id from public.companies r where r.referral_code = upper(trim(p_referral)) and r.id <> cid)
  where id = cid;

  if p_kind = 'contractor' then
    select coalesce(array_agg(x), '{}') into arr from jsonb_array_elements_text(p_profile -> 'work_types') x;
    update public.companies set work_types = arr, monthly_purchases = p_profile ->> 'monthly_purchases' where id = cid;
    select coalesce(array_agg(x), '{}') into arr from jsonb_array_elements_text(p_profile -> 'client_types') x;
    update public.companies set client_types = arr where id = cid;
  elsif p_kind = 'supplier' then
    update public.companies set
      supplier_type = p_profile ->> 'supplier_type',
      quote_email = coalesce(nullif(lower(trim(p_profile ->> 'quote_email')), ''), v_email),
      delivers = coalesce((p_profile ->> 'delivers')::boolean, true),
      pickup = coalesce((p_profile ->> 'pickup')::boolean, true),
      min_order_ex_vat = nullif(p_profile ->> 'min_order_ex_vat', '')::numeric,
      peppol = (p_profile ->> 'peppol')::boolean,
      commission_accepted_at = now()
    where id = cid;
  else
    select coalesce(array_agg(x), '{}') into arr from jsonb_array_elements_text(p_profile -> 'project_types') x;
    update public.companies set
      architect_number = nullif(trim(p_profile ->> 'architect_number'), ''),
      project_types = arr,
      projects_per_year = p_profile ->> 'projects_per_year'
    where id = cid;
  end if;

  insert into public.profiles (id, company_id, language, full_name)
  values (auth.uid(), cid, p_language, nullif(trim(p_profile ->> 'contact_name'), ''))
  on conflict (id) do update set company_id = excluded.company_id, language = excluded.language, full_name = excluded.full_name;
  insert into public.subscriptions (company_id) values (cid) on conflict (company_id) do nothing;

  if p_kind = 'contractor' then
    insert into public.company_trades (company_id, trade_id)
    select cid, t from unnest(p_trades) t where exists (select 1 from public.trades where id = t)
    on conflict do nothing;
  elsif p_kind = 'supplier' then
    perform public.set_supplier_coverage(p_categories, v_regions);
  end if;
  return cid;
end $$;
revoke all on function public.create_company(public.company_kind, text, text, text, text, public.app_language, jsonb, smallint[], smallint[], text) from public, anon;
grant execute on function public.create_company(public.company_kind, text, text, text, text, public.app_language, jsonb, smallint[], smallint[], text) to authenticated;
