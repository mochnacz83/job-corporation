
-- Table for collaborator indicators with evolution tracking
CREATE TABLE public.tecnicos_indicadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  re text NOT NULL,
  tt text DEFAULT '',
  nome text NOT NULL DEFAULT '',
  supervisor text DEFAULT '',
  eficacia text DEFAULT '-',
  produtividade text DEFAULT '-',
  dias_trabalhados text DEFAULT '-',
  repetida text DEFAULT '-',
  infancia text DEFAULT '-',
  lote_importacao text DEFAULT NULL,
  uploaded_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on RE to avoid duplicates
CREATE UNIQUE INDEX idx_tecnicos_indicadores_re ON public.tecnicos_indicadores (re);

-- Enable RLS
ALTER TABLE public.tecnicos_indicadores ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated can view indicadores"
  ON public.tecnicos_indicadores FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert indicadores"
  ON public.tecnicos_indicadores FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update indicadores"
  ON public.tecnicos_indicadores FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Admins can delete indicadores"
  ON public.tecnicos_indicadores FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for evolution/revisit tracking
CREATE TABLE public.vistoria_evolucao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_re text NOT NULL,
  user_id uuid NOT NULL,
  data_revisita date NOT NULL DEFAULT CURRENT_DATE,
  eficacia_anterior text DEFAULT '-',
  eficacia_atual text DEFAULT '-',
  produtividade_anterior text DEFAULT '-',
  produtividade_atual text DEFAULT '-',
  repetida_anterior text DEFAULT '-',
  repetida_atual text DEFAULT '-',
  infancia_anterior text DEFAULT '-',
  infancia_atual text DEFAULT '-',
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vistoria_evolucao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view evolucao"
  ON public.vistoria_evolucao FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert evolucao"
  ON public.vistoria_evolucao FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage evolucao"
  ON public.vistoria_evolucao FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
