
ALTER TABLE public.telegram_alert_config
  ADD COLUMN IF NOT EXISTS send_times text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-alerts-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('telegram-alerts-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'telegram-alerts-every-5min',
  '*/5 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://mmcpusvycksqekyjtgtm.supabase.co/functions/v1/telegram-send-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tY3B1c3Z5Y2tzcWVreWp0Z3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NDA1NzQsImV4cCI6MjA4NzExNjU3NH0.4oRbmX5R-hz9DucDIjQXg7GZs7Qrs5Aq-BR6Gb_w7kU',
      'x-trigger', 'cron'
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
