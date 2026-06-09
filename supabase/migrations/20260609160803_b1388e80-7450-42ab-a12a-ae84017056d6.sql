ALTER TABLE public.telegram_alert_config
  ADD COLUMN IF NOT EXISTS start_minute integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_minute integer NOT NULL DEFAULT 0;