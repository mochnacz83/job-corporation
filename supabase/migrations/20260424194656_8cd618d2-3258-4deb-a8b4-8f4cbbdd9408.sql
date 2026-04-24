-- Extensões para agendamento horário
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabela FATO (CSV automático)
CREATE TABLE IF NOT EXISTS public.atividades_fato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ds_estado text,
  ds_macro_atividade text,
  matricula_tt text,
  matricula_tr text,
  nome_tecnico text,
  data_atividade date,
  data_termino timestamptz,
  raw jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atividades_fato_data ON public.atividades_fato(data_atividade);
CREATE INDEX IF NOT EXISTS idx_atividades_fato_tt ON public.atividades_fato(matricula_tt);
CREATE INDEX IF NOT EXISTS idx_atividades_fato_tr ON public.atividades_fato(matricula_tr);
CREATE INDEX IF NOT EXISTS idx_atividades_fato_estado ON public.atividades_fato(ds_estado);
CREATE INDEX IF NOT EXISTS idx_atividades_fato_macro ON public.atividades_fato(ds_macro_atividade);

ALTER TABLE public.atividades_fato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read atividades_fato"
ON public.atividades_fato FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage atividades_fato"
ON public.atividades_fato FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela DIMENSÃO (Presença - upload manual)
CREATE TABLE IF NOT EXISTS public.tecnicos_presenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tr text,
  tt text,
  funcionario text,
  operadora text,
  supervisor text,
  coordenador text,
  setor_origem text,
  setor_atual text,
  status text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tecnicos_presenca_tt ON public.tecnicos_presenca(tt) WHERE tt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tecnicos_presenca_tr ON public.tecnicos_presenca(tr);

ALTER TABLE public.tecnicos_presenca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tecnicos_presenca"
ON public.tecnicos_presenca FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tecnicos_presenca"
ON public.tecnicos_presenca FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Log de sincronização
CREATE TABLE IF NOT EXISTS public.atividades_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  rows_imported integer DEFAULT 0,
  error_message text,
  triggered_by text DEFAULT 'cron'
);

ALTER TABLE public.atividades_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sync log"
ON public.atividades_sync_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sync log"
ON public.atividades_sync_log FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));