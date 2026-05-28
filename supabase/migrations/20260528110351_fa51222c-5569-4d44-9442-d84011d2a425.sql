CREATE TABLE public.tecnicos_inicio_dia (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_atividade date NOT NULL,
  matricula_tt text NOT NULL,
  nome_tecnico text NOT NULL,
  supervisor text,
  coordenador text,
  setor text,
  hora_inicio time,
  fechou_antes_10h boolean NOT NULL DEFAULT false,
  observacao text,
  created_by text,
  created_by_user uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tecnicos_inicio_dia_unique UNIQUE (matricula_tt, data_atividade)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tecnicos_inicio_dia TO authenticated;
GRANT ALL ON public.tecnicos_inicio_dia TO service_role;

ALTER TABLE public.tecnicos_inicio_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tecnicos_inicio_dia"
  ON public.tecnicos_inicio_dia FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert tecnicos_inicio_dia"
  ON public.tecnicos_inicio_dia FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update tecnicos_inicio_dia"
  ON public.tecnicos_inicio_dia FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins can delete tecnicos_inicio_dia"
  ON public.tecnicos_inicio_dia FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_tecnicos_inicio_dia_updated_at
  BEFORE UPDATE ON public.tecnicos_inicio_dia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tecnicos_inicio_dia_data ON public.tecnicos_inicio_dia (data_atividade);
CREATE INDEX idx_tecnicos_inicio_dia_tt ON public.tecnicos_inicio_dia (matricula_tt);