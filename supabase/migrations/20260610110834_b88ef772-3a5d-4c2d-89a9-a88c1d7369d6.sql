-- Tabela principal de registros de qualidade (todas as 8 bases convergem aqui)
CREATE TABLE public.quality_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador text NOT NULL,
  tecnico_matricula text,
  num_documento text,
  municipio text,
  uf text,
  cdo text,
  dat_abertura timestamptz,
  dat_fechamento timestamptz,
  in_flag_indicador text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_batch uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_records_indicador ON public.quality_records (indicador);
CREATE INDEX idx_quality_records_indicador_tecnico ON public.quality_records (indicador, tecnico_matricula);
CREATE INDEX idx_quality_records_indicador_municipio ON public.quality_records (indicador, municipio);
CREATE INDEX idx_quality_records_indicador_dat_abertura ON public.quality_records (indicador, dat_abertura);

GRANT SELECT ON public.quality_records TO authenticated;
GRANT ALL ON public.quality_records TO service_role;

ALTER TABLE public.quality_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quality records"
  ON public.quality_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert quality records"
  ON public.quality_records FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quality records"
  ON public.quality_records FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quality records"
  ON public.quality_records FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabela de log de importações
CREATE TABLE public.quality_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador text NOT NULL,
  file_name text,
  rows_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_imports_indicador ON public.quality_imports (indicador, imported_at DESC);

GRANT SELECT ON public.quality_imports TO authenticated;
GRANT ALL ON public.quality_imports TO service_role;

ALTER TABLE public.quality_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view quality imports"
  ON public.quality_imports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert quality imports"
  ON public.quality_imports FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete quality imports"
  ON public.quality_imports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));