
ALTER TABLE public.telegram_alert_config
  ADD COLUMN IF NOT EXISTS start_hour integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS end_hour integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5,6,0}',
  ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
