-- Migração de REPARO para o módulo de Reagendamento
-- Garante que a tabela exista e que o cache do schema seja atualizado

-- 1. Cria a tabela se ela não existir (ou garante que esteja lá)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reagenda_history') THEN
        CREATE TABLE public.reagenda_history (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
            sa text,
            setor text,
            nome text,
            contato text,
            operadora text,
            tipo_atividade text,
            data_agendamento text,
            data_original_formatada text,
            data_nova text,
            status text DEFAULT 'Pendente',
            decisao text DEFAULT 'Pendente',
            periodo text,
            horario text,
            selecionado boolean DEFAULT false,
            deleted_by_user boolean DEFAULT false,
            last_contacted_at timestamp with time zone,
            created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
            updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );
    ELSE
        -- Se existir, garante que a coluna deleted_by_user existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reagenda_history' AND column_name='deleted_by_user') THEN
            ALTER TABLE public.reagenda_history ADD COLUMN deleted_by_user boolean DEFAULT false;
        END IF;
    END IF;
END $$;

-- 2. Habilita RLS
ALTER TABLE public.reagenda_history ENABLE ROW LEVEL SECURITY;

-- 3. Reconstrói as Políticas (DROP e CREATE para garantir estado limpo)
DROP POLICY IF EXISTS "Enable access for owners and admins" ON public.reagenda_history;
CREATE POLICY "Enable access for owners and admins" 
ON public.reagenda_history FOR SELECT 
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.reagenda_history;
CREATE POLICY "Enable insert for authenticated users" 
ON public.reagenda_history FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Enable update for owners and admins" ON public.reagenda_history;
CREATE POLICY "Enable update for owners and admins" 
ON public.reagenda_history FOR UPDATE 
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

DROP POLICY IF EXISTS "Enable delete for admins only" ON public.reagenda_history;
CREATE POLICY "Enable delete for admins only" 
ON public.reagenda_history FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 4. Notifica o PostgREST para recarregar o schema
-- Nota: Isso nem sempre é permitido em todas as configurações do Supabase via SQL Editor/Migrations,
-- mas é uma tentativa válida para resolver o erro de Schema Cache.
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.reagenda_history IS 'Tabela de histórico de reagendamentos. Reparada em 2026-03-14 para resolver erros de cache.';
