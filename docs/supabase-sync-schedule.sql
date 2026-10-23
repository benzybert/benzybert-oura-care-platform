-- Half-hourly Oura sync. Vercel's Hobby plan only allows daily crons, so the database calls the app instead.
-- Run once in the Supabase SQL editor (or with the Supabase connector's execute_sql). Idempotent: scheduling the
-- same name again replaces the job.
--
-- /api/sync/tick needs no secret: it returns only a count, and it syncs a connection only when its last sync is
-- 20 minutes old, so extra hits change nothing. The daily /api/cron/oura-sync (35-day window, CRON_SECRET) stays.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'oura-sync-tick',
  '*/30 * * * *',
  $$ select net.http_get(url := 'https://oura-care-platform.vercel.app/api/sync/tick', timeout_milliseconds := 60000); $$
);

-- Check the last runs:   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Check the responses:   select status_code, created from net._http_response order by created desc limit 5;
-- Stop it:               select cron.unschedule('oura-sync-tick');
