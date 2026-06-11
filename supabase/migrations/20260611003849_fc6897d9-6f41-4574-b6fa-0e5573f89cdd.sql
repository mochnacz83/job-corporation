
-- Add cron_secret to telegram_alert_config so the cron job can authenticate to the edge function
ALTER TABLE public.telegram_alert_config
  ADD COLUMN IF NOT EXISTS cron_secret text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

-- Ensure existing row has a non-default secret
UPDATE public.telegram_alert_config
  SET cron_secret = replace(gen_random_uuid()::text, '-', '')
  WHERE cron_secret IS NULL OR length(cron_secret) < 16;

-- Reschedule cron job to use header x-cron-secret read from telegram_alert_config
DO $$
DECLARE
  v_jobid int;
  v_secret text;
BEGIN
  SELECT cron_secret INTO v_secret FROM public.telegram_alert_config LIMIT 1;

  SELECT jobid INTO v_jobid FROM cron.job
    WHERE command ILIKE '%telegram-send-alert%' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'telegram-send-alert-tick',
    '* * * * *',
    format($cron$
      SELECT net.http_post(
        url := 'https://mmcpusvycksqekyjtgtm.supabase.co/functions/v1/telegram-send-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L,
          'x-trigger', 'cron'
        ),
        body := '{}'::jsonb
      );
    $cron$, v_secret)
  );
END $$;
