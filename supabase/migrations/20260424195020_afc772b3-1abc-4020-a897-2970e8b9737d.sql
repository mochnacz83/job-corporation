-- Remove agendamento anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('sync-atividades-fato-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Agenda a cada hora (no minuto 5 para dar tempo de o arquivo ser publicado)
SELECT cron.schedule(
  'sync-atividades-fato-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmcpusvycksqekyjtgtm.supabase.co/functions/v1/sync-atividades-fato',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trigger', 'cron'
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) AS request_id;
  $$
);