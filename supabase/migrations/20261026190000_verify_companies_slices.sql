-- The nightly register check ran into the 150 s function limit: it now runs in short slices
-- every 15 minutes between 02:00 and 05:45 UTC, each stopping on its own time budget.
select cron.unschedule('verify-companies');
select cron.schedule('verify-companies', '*/15 2-5 * * *', $$select public.call_job('verify-company')$$);
