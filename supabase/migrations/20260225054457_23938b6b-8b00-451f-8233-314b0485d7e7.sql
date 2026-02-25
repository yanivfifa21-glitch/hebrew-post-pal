-- Update cron job to use longer timeout (30 seconds instead of default 5s)
SELECT cron.unschedule('auto-post-every-minute');

SELECT cron.schedule(
  'auto-post-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://bisxrtkervvyoqtyrnxt.supabase.co/functions/v1/auto-post',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{"triggered_by": "cron"}'::jsonb,
    timeout_milliseconds:=30000
  ) AS request_id;
  $$
);