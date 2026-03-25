-- Create tecnicos_indicadores table
CREATE TABLE IF NOT EXISTS public.tecnicos_indicadores (
    re text PRIMARY KEY,
    tt text,
    nome text,
    supervisor text,
    eficacia text,
    produtividade text,
    dias_trabalhados text,
    repetida text,
    infancia text,
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for tecnicos_indicadores
ALTER TABLE public.tecnicos_indicadores ENABLE ROW LEVEL SECURITY;

-- Add policies for tecnicos_indicadores
CREATE POLICY "Enable read for authenticated users" ON public.tecnicos_indicadores
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable all for admins" ON public.tecnicos_indicadores
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Create vistorias_campo table
CREATE TABLE IF NOT EXISTS public.vistorias_campo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    tecnico_re text NOT NULL,
    tecnico_tt text,
    nome_tecnico text,
    supervisor_tecnico text,
    indicador_eficacia text,
    indicador_produtividade text,
    indicador_dias_trabalhados text,
    indicador_repetida text,
    indicador_infancia text,
    observacoes text,
    foto_supervisor_url text,
    foto_equipamentos_url text,
    foto_execucao_url text,
    assinatura_supervisor text,
    assinatura_tecnico text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for vistorias_campo
ALTER TABLE public.vistorias_campo ENABLE ROW LEVEL SECURITY;

-- Add policies for vistorias_campo
CREATE POLICY "Enable view for own or admin" ON public.vistorias_campo
    FOR SELECT TO authenticated USING (
        user_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Enable insert for authenticated" ON public.vistorias_campo
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete for admin" ON public.vistorias_campo
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
