CREATE TABLE public.planilhas_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  url text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planilhas_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active planilhas_links"
ON public.planilhas_links FOR SELECT TO authenticated
USING (ativo = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert planilhas_links"
ON public.planilhas_links FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update planilhas_links"
ON public.planilhas_links FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete planilhas_links"
ON public.planilhas_links FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_planilhas_links_updated_at
BEFORE UPDATE ON public.planilhas_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();