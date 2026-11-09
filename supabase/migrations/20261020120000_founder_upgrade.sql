-- A founder may move up from Starter to Premium once and keep the price guarantee
-- (Henrique's rule); any other change, or a second one, ends it.
alter table public.subscriptions add column founder_plan_changed_at timestamptz;
