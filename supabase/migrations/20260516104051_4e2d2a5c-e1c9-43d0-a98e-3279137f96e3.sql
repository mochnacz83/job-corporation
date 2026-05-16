
CREATE TABLE public.app_html_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  html text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_html_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read html pages"
  ON public.app_html_pages FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage html pages"
  ON public.app_html_pages FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_app_html_pages_updated_at
  BEFORE UPDATE ON public.app_html_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
