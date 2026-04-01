-- Tabela para a carga inicial (importada pelo admin)
CREATE TABLE IF NOT EXISTS public.inventory_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial TEXT NOT NULL,
    modelo TEXT,
    nome_tecnico TEXT NOT NULL,
    matricula_tt TEXT NOT NULL,
    setor TEXT,
    supervisor TEXT,
    coordenador TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para os envios de inventário dos colaboradores
CREATE TABLE IF NOT EXISTS public.inventory_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula_tt TEXT NOT NULL,
    nome_tecnico TEXT NOT NULL,
    data_inicio TIMESTAMPTZ DEFAULT now(),
    data_fim TIMESTAMPTZ,
    status TEXT DEFAULT 'em_andamento', -- 'em_andamento', 'finalizado'
    user_id UUID REFERENCES auth.users(id)
);

-- Detalhes de cada item no inventário submetido
CREATE TABLE IF NOT EXISTS public.inventory_submission_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES public.inventory_submissions(id) ON DELETE CASCADE,
    serial TEXT NOT NULL,
    modelo TEXT,
    status TEXT NOT NULL, -- 'presente', 'falta', 'extra'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.inventory_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_submission_items ENABLE ROW LEVEL SECURITY;

-- Políticas simples (Admin tem tudo, usuários autenticados podem ver e inserir)
CREATE POLICY "Permitir tudo para administradores no inventory_base"
ON public.inventory_base FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir tudo para administradores no inventory_submissions"
ON public.inventory_submissions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir tudo para administradores no inventory_submission_items"
ON public.inventory_submission_items FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
