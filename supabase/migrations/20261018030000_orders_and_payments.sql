-- Purchase orders, proof of purchase, commission bills and plan payments.
--
-- The contractor pays the supplier directly. An awarded offer becomes a numbered
-- purchase order, and every step that proves the sale went through BatiLink is
-- recorded: the supplier's acceptance of the commission terms (on the offer), the
-- supplier's confirmation of the order, the deposit proof and its receipt, the
-- delivery, the supplier's invoice (checked against the order) and the proof of
-- payment. At the end of the month the commission on proven sales is billed to
-- each supplier. Plans and commission bills are paid on Stripe's pages: card and
-- bank details never reach BatiLink.

-- Orders -----------------------------------------------------------------------

create type public.order_status as enum (
  'awaiting_supplier',   -- the supplier has not confirmed yet
  'awaiting_deposit',    -- confirmed, a deposit is required before the order starts
  'deposit_proof_sent',  -- the contractor sent proof of the deposit transfer
  'in_progress',         -- the supplier launched the order
  'delivered',           -- the contractor confirmed receipt
  'cancelled'
);

create sequence public.purchase_order_seq;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default 'BL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0'),
  quote_id uuid not null unique references public.quotes on delete restrict,
  request_id uuid not null references public.price_requests on delete restrict,
  contractor_id uuid not null references public.companies on delete restrict,
  supplier_id uuid not null references public.companies on delete restrict,
  title text not null,
  -- Frozen at award time, computed by the server.
  total_ex_vat numeric(14, 2) not null check (total_ex_vat >= 0),
  vat numeric(14, 2) not null check (vat >= 0),
  total_inc_vat numeric(14, 2) not null check (total_inc_vat >= 0),
  status public.order_status not null default 'awaiting_supplier',
  terms_accepted_at timestamptz,
  supplier_confirmed_at timestamptz,
  deposit_inc_vat numeric(14, 2) not null default 0 check (deposit_inc_vat >= 0),
  supplier_iban text check (supplier_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  deposit_proof_sent_at timestamptz,
  deposit_received_at timestamptz,
  deposit_rejected_reason text,
  delivered_at timestamptz,
  -- The contractor declared paying the supplier, with proof.
  payment_reported_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deposit_inc_vat <= total_inc_vat)
);
create index purchase_orders_contractor_idx on public.purchase_orders (contractor_id, created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, created_at desc);
create index purchase_orders_open_idx on public.purchase_orders (status, created_at) where status not in ('delivered', 'cancelled');

-- Links to the order sent to the supplier by e-mail (one per e-mail, so earlier
-- e-mails keep working). Only the SHA-256 of each token is stored.
create table public.order_links (
  token_hash text primary key,
  order_id uuid not null references public.purchase_orders on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index order_links_order_idx on public.order_links (order_id);

-- Documents attached to an order: deposit proofs, delivery notes, invoices.
-- Files live in the private `order-documents` bucket, read only through the
-- functions (signed links valid a few minutes).
create type public.order_document_kind as enum ('deposit_proof', 'delivery_note', 'invoice', 'payment_proof');
create type public.invoice_check as enum ('matched', 'mismatch', 'manual_review');

create table public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders on delete restrict,
  kind public.order_document_kind not null,
  uploaded_by uuid references auth.users on delete set null,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Fingerprint of the file as received: proves it was not altered afterwards.
  sha256 text not null,
  -- Invoices only: what was read from the file and how it compares to the order.
  invoice_number text,
  issue_date date,
  supplier_vat text,
  buyer_vat text,
  invoice_total_ex_vat numeric(14, 2),
  order_reference text,
  check_status public.invoice_check,
  findings text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index order_documents_order_idx on public.order_documents (order_id, created_at);
-- The same invoice cannot be used twice.
create unique index order_documents_invoice_once on public.order_documents (supplier_vat, invoice_number)
  where kind = 'invoice' and invoice_number is not null;

-- Payments ----------------------------------------------------------------------

-- Payments made to BatiLink itself: commission bills (plans are tracked in `subscriptions`).
create type public.payment_purpose as enum ('commission', 'subscription');
create type public.payment_status as enum ('open', 'paid', 'failed', 'expired');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  purpose public.payment_purpose not null,
  company_id uuid not null references public.companies on delete restrict,
  commission_bill_id uuid,
  amount_cents bigint not null check (amount_cents > 0),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  status public.payment_status not null default 'open',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_company_idx on public.payments (company_id, created_at desc);

-- Commissions -------------------------------------------------------------------

alter table public.commissions
  add column order_id uuid unique references public.purchase_orders on delete restrict,
  -- 'offer' until a matching supplier invoice replaces the base with the invoiced amount.
  add column base_source text not null default 'offer' check (base_source in ('offer', 'invoice')),
  add column bill_id uuid;

-- Monthly bill of the commission still due by a supplier (paid online by link).
-- Its number is the reference of the matching Peppol invoice from accounting.
create sequence public.commission_bill_seq;
create table public.commission_bills (
  id uuid primary key default gen_random_uuid(),
  number text not null unique
    default 'BL-COM-' || to_char(now(), 'YYYY-MM') || '-' || lpad(nextval('public.commission_bill_seq')::text, 5, '0'),
  supplier_id uuid not null references public.companies on delete restrict,
  month date not null,
  amount_ex_vat numeric(14, 2) not null check (amount_ex_vat > 0),
  vat numeric(14, 2) not null check (vat >= 0),
  amount_inc_vat numeric(14, 2) not null check (amount_inc_vat > 0),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  pay_token_hash text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (supplier_id, month)
);
alter table public.commissions add constraint commissions_bill_fk foreign key (bill_id) references public.commission_bills on delete restrict;
alter table public.payments add constraint payments_bill_fk foreign key (commission_bill_id) references public.commission_bills on delete restrict;

-- Payment accounts ---------------------------------------------------------------

-- Written by the server only (not granted to the app).
alter table public.companies
  add column stripe_customer_id text unique;

alter table public.subscriptions
  add column provider_subscription_id text unique;

-- Access -------------------------------------------------------------------------

alter table public.purchase_orders enable row level security;
alter table public.order_documents enable row level security;
alter table public.payments enable row level security;
alter table public.commission_bills enable row level security;
alter table public.order_links enable row level security;

-- Contractors read their own orders; suppliers use their link. Every write goes
-- through the functions, which check each step.
create policy "contractors read own orders" on public.purchase_orders
  for select to authenticated using (contractor_id = public.my_company_id());
revoke all on public.purchase_orders from authenticated, anon;
grant select (id, number, quote_id, request_id, contractor_id, supplier_id, title, total_ex_vat, vat, total_inc_vat,
              status, terms_accepted_at, supplier_confirmed_at, deposit_inc_vat, supplier_iban, deposit_proof_sent_at,
              deposit_received_at, deposit_rejected_reason, delivered_at, payment_reported_at, cancelled_at, cancel_reason,
              created_at, updated_at)
  on public.purchase_orders to authenticated;

create policy "contractors read documents of own orders" on public.order_documents
  for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = order_documents.order_id and o.contractor_id = public.my_company_id()));
revoke all on public.order_documents from authenticated, anon;
grant select (id, order_id, kind, file_name, content_type, size_bytes, sha256, invoice_number, issue_date,
              invoice_total_ex_vat, check_status, findings, created_at)
  on public.order_documents to authenticated;

create policy "companies read own payments" on public.payments
  for select to authenticated using (company_id = public.my_company_id());
revoke all on public.payments from authenticated, anon;
grant select (id, purpose, amount_cents, status, created_at, paid_at) on public.payments to authenticated;

-- Back office only.
revoke all on public.commission_bills from authenticated, anon;
revoke all on public.order_links from authenticated, anon;

-- Plans change only through the payment webhook.
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- Private bucket for order documents (no policy: only the service role reads it).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('order-documents', 'order-documents', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/xml', 'text/xml'])
    on conflict (id) do nothing;
  end if;
end $$;
