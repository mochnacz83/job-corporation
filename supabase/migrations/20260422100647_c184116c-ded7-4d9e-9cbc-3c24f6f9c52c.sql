ALTER TABLE public.tecnicos_cadastro
  ADD COLUMN IF NOT EXISTS re text;

CREATE INDEX IF NOT EXISTS idx_tecnicos_cadastro_re ON public.tecnicos_cadastro (re);