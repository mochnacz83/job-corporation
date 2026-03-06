
ALTER TABLE public.material_coletas 
  ADD COLUMN IF NOT EXISTS matricula_tt text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS sigla_cidade text,
  ADD COLUMN IF NOT EXISTS uf text;
