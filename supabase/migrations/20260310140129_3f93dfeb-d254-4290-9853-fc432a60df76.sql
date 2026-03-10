ALTER TABLE public.material_coletas ADD COLUMN IF NOT EXISTS local_retirada text DEFAULT NULL;
ALTER TABLE public.material_coletas ADD COLUMN IF NOT EXISTS classificacao_cenario text DEFAULT NULL;
ALTER TABLE public.material_coletas ADD COLUMN IF NOT EXISTS circuito_compartilhado text DEFAULT NULL;
ALTER TABLE public.material_coletas ADD COLUMN IF NOT EXISTS opcoes_adicionais text DEFAULT NULL;