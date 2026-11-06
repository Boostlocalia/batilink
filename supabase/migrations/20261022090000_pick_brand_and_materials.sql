-- Nodi's supplier pick: one shop per brand, and only shops that sell the requested materials.

-- A supplier's brand: its website domain, else its e-mail domain unless it is a mailbox provider,
-- else its name without legal form and city. Two branches of one chain share a brand.
create or replace function public.supplier_brand(p_website text, p_email text, p_name text)
returns text
language sql immutable set search_path = public as $fn$
  with d as (
    select
      nullif(regexp_replace(lower(split_part(regexp_replace(coalesce(p_website, ''), '^[a-z]+://', '', 'i'), '/', 1)), '^www\.', ''), '') as web,
      nullif(lower(split_part(coalesce(p_email, ''), '@', 2)), '') as mail
  ), g as (
    select
      case when web ~ '(facebook|instagram|google|linkedin|linktr|wix|jimdo|business\.site|pagesdor|goldenpages|goudengids)' then null else web end as web,
      case when mail ~ '^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|skynet|telenet|proximus|scarlet|voo|base|belgacom|orange|mail|gmx|aol|protonmail)\.' then null else mail end as mail
    from d
  )
  select coalesce(
    -- brand.be and brandgroup.com style domains: keep the label before the TLD
    split_part(coalesce(g.web, g.mail), '.', greatest(array_length(string_to_array(coalesce(g.web, g.mail), '.'), 1) - 1, 1)),
    trim(regexp_replace(regexp_replace(lower(coalesce(p_name, '')), '\(.*\)', '', 'g'), '^(ets\.?|éts\.?|etablissements|établissements|sa|srl|sprl|nv|bv|bvba)\s+', ''))
  )
  from g
$fn$;

-- The material families a request needs: its chosen category plus those its item labels name (FR and NL).
create or replace function public.request_categories(p_request_id uuid)
returns smallint[]
language sql stable security definer set search_path = public as $fn$
  with txt as (
    select r.category_id, lower(coalesce(r.title, '') || ' ' || coalesce(string_agg(i.label, ' '), '')) as t
    from price_requests r left join request_items i on i.request_id = r.id
    where r.id = p_request_id
    group by r.id
  ), k(cat, re) as (values
    (1::smallint, '\m(b[ée]ton|ciment|cement|mortier|mortel|blocs?|briques?|baksteen|parpaing|snelbouw|sable|zand|gravier|grind|chape|treillis|ferraill|hourdis|sika\w*|[ée]tanch\w*|r[ée]sine|hydrofuge|cimenteux)'),
    (2::smallint, '\m(isol\w*|laine|pir|pur|xps|eps|polystyr\w*|rockwool|isover|ursa|steenwol|glaswol|polyur[ée]than\w*)\M'),
    (3::smallint, '\m(bois|osb|contreplaqu\w*|mdf|multiplex|panneaux?|planches?|poutres?|chevrons?|lattes?|madriers?|douglas|sapin|hout\w*|pla(at|ten)|balken?|regels?)\M'),
    (4::smallint, '\m(tuiles?|ardoises?|zinc|goutti[èe]res?|roofing|epdm|sous-toiture|toiture|dakpan\w*|leien|goot|bitum\w*|fa[îi]ti[èe]res?)\M'),
    (5::smallint, '\m(carrel\w*|fa[ïi]ence|dalles?|tegels?|plavuis\w*|voeg\w*)\M'),
    (6::smallint, '\m(wc|lavabos?|douches?|baignoires?|robinet\w*|[ée]viers?|sanitaire\w*|siphons?|kranen|kraan|bad)\M'),
    (7::smallint, '\m(c[âa]bles?|prises?|interrupteurs?|disjoncteurs?|[ée]lectri\w*|gaines?|luminaires?|kabels?|stopcontact\w*|schakelaar\w*)\M'),
    (8::smallint, '\m(chaudi[èe]res?|radiateurs?|pompe à chaleur|ventilation|vmc|chauffage|ketels?|verwarming|warmtepomp\w*)\M'),
    (9::smallint, '\m(portes?|fen[êe]tres?|ch[âa]ssis|vitrages?|deuren?|ramen|vensters?)\M'),
    (10::smallint, '\m(location|mini-pelle|[ée]chafaud\w*|b[ée]tonni[èe]re|perceuse|disqueuse|huur|stelling\w*)\M')
  )
  select coalesce(array_agg(distinct c order by c) filter (where c is not null), '{}')
  from txt, lateral (
    select txt.category_id as c
    union all
    select k.cat from k where txt.t ~ k.re
  ) cats
$fn$;

create or replace function public.pick_suppliers(p_request_id uuid, p_count integer)
returns setof uuid
language sql stable security definer set search_path = public as $fn$
  with r as (
    select postal_code, category_id, fulfilment, request_categories(id) as cats from price_requests where id = p_request_id
  ),
  n as (
    -- With known materials, any nearby supplier is a candidate; coverage is checked below.
    select ns.id, coalesce(ns.km, 999) as km
    from r, nearby_suppliers(r.postal_code, case when cardinality(r.cats) > 0 then null else r.category_id end) ns
    where request_radius_ok(r.fulfilment, ns.km)
  ),
  asked as (
    select supplier_brand(co.website, coalesce(co.quote_email, co.email), co.name) as brand
    from quotes q join companies co on co.id = q.supplier_id
    where q.request_id = p_request_id
  ),
  c as (
    select n.id, n.km, co.verified_at,
      supplier_brand(co.website, coalesce(co.quote_email, co.email), co.name) as brand,
      (select count(distinct sc.category_id) from supplier_coverage sc where sc.supplier_id = n.id) as breadth,
      (select count(distinct sc.category_id) from supplier_coverage sc where sc.supplier_id = n.id and sc.category_id = any(r.cats)) as covered,
      (select max(q.created_at) from quotes q where q.supplier_id = n.id) as last_asked
    from n
    cross join r
    join companies co on co.id = n.id
    where co.kind = 'supplier'
      and co.requests_stopped_at is null
      and coalesce(co.quote_email, co.email) is not null
      and not exists (select 1 from quotes q where q.request_id = p_request_id and q.supplier_id = n.id)
  ),
  ranked as (
    select c.*, row_number() over (
      partition by c.brand
      order by c.covered desc, c.km, c.last_asked asc nulls first, (c.verified_at is null), random()
    ) as brand_rank
    from c, r
    -- Sells at least one of the requested materials.
    where cardinality(r.cats) = 0 or c.covered > 0
  )
  select x.id from ranked x, r
  -- One shop per brand, and never a brand already asked on this request.
  where x.brand_rank = 1 and x.brand not in (select brand from asked where brand is not null)
  order by x.covered desc,
    floor(x.km / 10),
    case when cardinality(r.cats) = 0 then -x.breadth else 0 end,
    x.last_asked asc nulls first,
    (x.verified_at is null),
    random()
  limit greatest(p_count, 0);
$fn$;

revoke execute on function public.supplier_brand(text, text, text) from public, anon;
revoke execute on function public.request_categories(uuid) from public, anon, authenticated;
grant execute on function public.request_categories(uuid) to service_role;
revoke all on function public.pick_suppliers(uuid, integer) from public, anon, authenticated;
grant execute on function public.pick_suppliers(uuid, integer) to service_role;
