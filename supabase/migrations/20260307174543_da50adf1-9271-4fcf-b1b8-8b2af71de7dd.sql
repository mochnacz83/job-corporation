ALTER TABLE public.tecnicos_cadastro 
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS cidade_residencia text;