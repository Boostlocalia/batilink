# Security checklist

Every new feature, page, sales funnel or marketing site for BatiNode goes through
this list before it ships. (Asked by Henrique, 2026-10-19.)

## Database
- Every new table: RLS on, policies for exactly what the app needs, and column
  grants instead of table grants when some columns are private.
- Never let the app update a column that links a user to a company, sets a status,
  a plan, a price or a commission. Those change through edge functions or RPCs.
- Run the Supabase security advisor after each migration.

## Edge functions
- Service-role clients bypass RLS: check ownership of every id taken from the request.
- Anything that costs money or sends e-mail (AI calls, mails, uploads) gets a rate
  limit (`_shared/limits.ts`).
- Secrets are compared with `sameSecret`, never with `===`, and never logged or returned.
- Webhooks verify their signature; tokens are random, hashed and expire.
- User text in e-mails is escaped; only proven addresses (the sign-in e-mail) claim
  anything.

## Web (app and marketing pages)
- Content-Security-Policy on every page (`scripts/add-csp.mjs` for the app).
- No inline scripts, no third-party scripts without a reason; forms post to our own
  endpoints, which validate and rate-limit.
- HTTPS only; no secrets in front-end code (the Supabase anon key is public by design).

## Before shipping
- Type check, lint, tests; try the feature as a second company to confirm it can't see
  or change the first one's data.
