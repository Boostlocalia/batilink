-- Offers priced per package (bucket, bag, roll): the package, its price and how many
-- the supplier offers, so offers are compared on the same number of packages.
alter table public.quote_items
  add column package_size text check (char_length(package_size) <= 40),
  add column package_price numeric(12, 4) check (package_price >= 0),
  add column packages numeric(10, 2) check (packages > 0);

-- What Nodi read in the PDF a supplier attached on their page, kept until they send the form.
alter table public.quotes add column offer_reading jsonb;
