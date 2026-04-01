-- Adicionar coluna codigo_material na tabela inventory_base
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_base' AND column_name='codigo_material') THEN
        ALTER TABLE public.inventory_base ADD COLUMN codigo_material TEXT;
    END IF;
END $$;

-- Adicionar coluna codigo_material na tabela inventory_submission_items
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_submission_items' AND column_name='codigo_material') THEN
        ALTER TABLE public.inventory_submission_items ADD COLUMN codigo_material TEXT;
    END IF;
END $$;

-- Atualizar pol铆ticas de RLS para garantir que perfis de Supervisor e Coordenador possam ler os dados
-- (As pol铆ticas atuais j谩 permitem authenticated ver tudo, mas vamos refor莽ar se necess谩rio)
-- O plano original j谩 cobre isso com "Permitir tudo para administradores", 
-- mas usu谩rios normais tamb茅m precisam ler para o relat贸rio de acompanhamento.

CREATE POLICY "Permitir leitura para todos os autenticados no inventory_submissions"
ON public.inventory_submissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Permitir leitura para todos os autenticados no inventory_submission_items"
ON public.inventory_submission_items FOR SELECT
TO authenticated
USING (true);
