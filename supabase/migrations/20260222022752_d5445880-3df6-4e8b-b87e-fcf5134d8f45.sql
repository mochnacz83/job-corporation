
-- Access logs table
CREATE TABLE public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'login',
  page text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view all access logs"
ON public.access_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can insert their own logs
CREATE POLICY "Users can insert own access logs"
ON public.access_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Online presence table
CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  current_page text
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Admins can view all presence
CREATE POLICY "Admins can view all presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can upsert own presence
CREATE POLICY "Users can upsert own presence"
ON public.user_presence
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
ON public.user_presence
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Add a fictitious PowerBI link for testing
INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
VALUES (
  'Dashboard de Vendas',
  'Relatório geral de vendas e metas por região',
  'https://app.powerbi.com/view?r=demo-embed-placeholder',
  1,
  true
);

-- Admin can manage roles (already has insert/delete policies)
-- Admin can manage powerbi_links
CREATE POLICY "Admins can insert powerbi_links"
ON public.powerbi_links
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update powerbi_links"
ON public.powerbi_links
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete powerbi_links"
ON public.powerbi_links
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
