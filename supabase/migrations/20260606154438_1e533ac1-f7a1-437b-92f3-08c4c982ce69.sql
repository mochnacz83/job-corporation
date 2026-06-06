
-- 1) config global (singleton)
CREATE TABLE public.telegram_alert_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_config TO authenticated;
GRANT ALL ON public.telegram_alert_config TO service_role;
ALTER TABLE public.telegram_alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telegram_alert_config" ON public.telegram_alert_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_telegram_alert_config_updated BEFORE UPDATE ON public.telegram_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.telegram_alert_config (enabled) VALUES (false);

-- 2) destinatários
CREATE TABLE public.telegram_alert_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_recipients TO authenticated;
GRANT ALL ON public.telegram_alert_recipients TO service_role;
ALTER TABLE public.telegram_alert_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telegram_alert_recipients" ON public.telegram_alert_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_telegram_alert_recipients_updated BEFORE UPDATE ON public.telegram_alert_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) limites por cidade
CREATE TABLE public.telegram_alert_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade text NOT NULL UNIQUE,
  limite integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_thresholds TO authenticated;
GRANT ALL ON public.telegram_alert_thresholds TO service_role;
ALTER TABLE public.telegram_alert_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telegram_alert_thresholds" ON public.telegram_alert_thresholds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_telegram_alert_thresholds_updated BEFORE UPDATE ON public.telegram_alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.telegram_alert_thresholds (cidade, limite) VALUES
  ('ITAJAI', 30),
  ('BLUMENAU', 35),
  ('JOINVILLE', 35),
  ('FLORIANOPOLIS', 20),
  ('BRUSQUE', 20);

-- 4) log de envios
CREATE TABLE public.telegram_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade text,
  total_reparos integer,
  novos_ultima_hora integer,
  recipients_count integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  message_text text,
  payload jsonb,
  triggered_by text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_log TO authenticated;
GRANT ALL ON public.telegram_alert_log TO service_role;
ALTER TABLE public.telegram_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telegram_alert_log" ON public.telegram_alert_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_telegram_alert_log_sent_at ON public.telegram_alert_log (sent_at DESC);
