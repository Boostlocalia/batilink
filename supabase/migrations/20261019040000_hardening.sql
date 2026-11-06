-- Fixes from the Supabase security and performance advisors.

-- Helpers only make sense for a signed-in company: visitors cannot call them.
revoke execute on function public.my_company_id() from public, anon;
revoke execute on function public.owns_request(uuid) from public, anon;
revoke execute on function public.can_use_network() from public, anon;
revoke execute on function public.match_suppliers(uuid) from public, anon;
revoke execute on function public.agreement_contacts(uuid) from public, anon;
grant execute on function public.my_company_id(), public.owns_request(uuid), public.can_use_network(),
  public.match_suppliers(uuid), public.agreement_contacts(uuid) to authenticated;

-- Replaced by create_company(); nobody calls these any more.
revoke execute on function public.create_contractor_company(text, text, text, text, public.app_language)
  from public, anon, authenticated;

alter function public.region_prefixes(text) set search_path = '';

-- auth.uid() evaluated once per query, not once per row.
alter policy "read own profile" on public.profiles using (id = (select auth.uid()));
alter policy "update own profile" on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Foreign keys used to join or to check a delete.
create index agreements_opportunity_idx on public.agreements (opportunity_id);
create index commissions_bill_idx on public.commissions (bill_id);
create index commissions_contractor_idx on public.commissions (contractor_id);
create index companies_referred_by_idx on public.companies (referred_by);
create index company_checks_agreement_idx on public.company_checks (agreement_id);
create index company_trades_trade_idx on public.company_trades (trade_id);
create index events_company_idx on public.events (company_id);
create index payments_bill_idx on public.payments (commission_bill_id);
create index preferred_suppliers_supplier_idx on public.preferred_suppliers (supplier_id);
create index price_requests_category_idx on public.price_requests (category_id);
create index project_commissions_architect_idx on public.project_commissions (architect_id);
create index project_commissions_contractor_idx on public.project_commissions (contractor_id);
create index project_commissions_bill_idx on public.project_commissions (bill_id);
create index purchase_orders_request_idx on public.purchase_orders (request_id);
create index referral_rewards_bill_idx on public.referral_rewards (used_bill_id);
create index supplier_invitations_supplier_idx on public.supplier_invitations (supplier_id);
