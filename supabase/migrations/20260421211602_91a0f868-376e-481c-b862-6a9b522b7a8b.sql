-- Drop e recria a tabela de indicadores como FATO
DROP TABLE IF EXISTS public.tecnicos_indicadores CASCADE;

CREATE TABLE public.tecnicos_indicadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tt text NOT NULL,
  mes_referencia date NOT NULL DEFAULT date_trunc('month', now())::date,
  
  -- Indicadores diretos
  eficacia numeric,
  produtividade numeric,
  dias_trabalhados numeric,
  
  -- Repetida detalhada
  repetida_entrantes numeric DEFAULT 0,
  repetida_repetiu numeric DEFAULT 0,
  repetida_pct numeric GENERATED ALWAYS AS (
    CASE WHEN COALESCE(repetida_entrantes, 0) > 0
      THEN ROUND((COALESCE(repetida_repetiu, 0) / repetida_entrantes) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Infância detalhada
  infancia_instaladas numeric DEFAULT 0,
  infancia_chamados_30d numeric DEFAULT 0,
  infancia_pct numeric GENERATED ALWAYS AS (
    CASE WHEN COALESCE(infancia_instaladas, 0) > 0
      THEN ROUND((COALESCE(infancia_chamados_30d, 0) / infancia_instaladas) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  uploaded_by uuid,
  lote_importacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT tecnicos_indicadores_tt_mes_unique UNIQUE (tt, mes_referencia)
);

CREATE INDEX idx_tecnicos_indicadores_tt ON public.tecnicos_indicadores(tt);
CREATE INDEX idx_tecnicos_indicadores_mes ON public.tecnicos_indicadores(mes_referencia DESC);

ALTER TABLE public.tecnicos_indicadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view indicadores"
  ON public.tecnicos_indicadores FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins or uploader can insert indicadores"
  ON public.tecnicos_indicadores FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = uploaded_by);

CREATE POLICY "Admins or uploader can update indicadores"
  ON public.tecnicos_indicadores FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = uploaded_by);

CREATE POLICY "Admins can delete indicadores"
  ON public.tecnicos_indicadores FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_tecnicos_indicadores_updated_at
  BEFORE UPDATE ON public.tecnicos_indicadores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();