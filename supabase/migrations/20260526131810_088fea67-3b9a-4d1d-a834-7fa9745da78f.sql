
CREATE TABLE public.justificativas_10h (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  matricula_tt TEXT NOT NULL,
  nome_tecnico TEXT NOT NULL,
  supervisor TEXT,
  coordenador TEXT,
  setor TEXT,
  data_atividade DATE NOT NULL,
  causa TEXT NOT NULL,
  observacao TEXT,
  bloqueado BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_by_user UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (matricula_tt, data_atividade)
);

CREATE INDEX idx_justificativas_10h_data ON public.justificativas_10h(data_atividade);
CREATE INDEX idx_justificativas_10h_tt ON public.justificativas_10h(matricula_tt);
CREATE INDEX idx_justificativas_10h_supervisor ON public.justificativas_10h(supervisor);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.justificativas_10h TO authenticated;
GRANT ALL ON public.justificativas_10h TO service_role;

ALTER TABLE public.justificativas_10h ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view justificativas_10h"
  ON public.justificativas_10h FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert justificativas_10h"
  ON public.justificativas_10h FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update justificativas_10h"
  ON public.justificativas_10h FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete justificativas_10h"
  ON public.justificativas_10h FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_justificativas_10h_updated_at
  BEFORE UPDATE ON public.justificativas_10h
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
