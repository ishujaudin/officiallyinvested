-- pg_cron schedule for acq-seller-letter (run once in the SQL editor).
-- Same shape as the other acq-* jobs: the internal secret is read from
-- public.oi_config inside the command, never stored in the job itself.
-- Runs at :05 and :35 so queued letters are waiting for the next
-- acq-outreach-runner tick (*/15) once approved.

select cron.schedule(
  'acq-seller-letters-30m',
  '5,35 * * * *',
  $$
  select net.http_post(
    url     := 'https://edplsdocwqzzsdvduwly.supabase.co/functions/v1/acq-seller-letter',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-acq-secret', (select value from public.oi_config where key = 'acq_internal_secret')),
    body    := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- to pause:   select cron.unschedule('acq-seller-letters-30m');
-- to inspect: select jobname, schedule, active from cron.job where jobname = 'acq-seller-letters-30m';
