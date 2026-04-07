
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value) VALUES ('inventory_locked', 'true'::jsonb);
