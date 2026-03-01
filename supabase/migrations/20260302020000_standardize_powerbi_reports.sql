-- 1. Padronizar Títulos e URLs dos Relatórios Power BI
-- Relatório 1: Home Connect
-- Tenta achar por IDs passados ou títulos parecidos e padroniza
UPDATE public.powerbi_links 
SET titulo = 'Dashboard Operacional Home Connect', 
    descricao = 'Visualização operacional detalhada Home Connect',
    ativo = true
WHERE titulo ILIKE '%Home Connect%' OR titulo = 'Relatório Power BI' OR titulo = 'Dashboard de Vendas';

-- Relatório 2: Comunicação de Dados
-- Insere se não existir, ou atualiza se já existir algo parecido
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.powerbi_links WHERE titulo ILIKE '%Comunicação de Dados%') THEN
        UPDATE public.powerbi_links 
        SET titulo = 'Dashboard Operacional Comunicação de Dados',
            descricao = 'Monitoramento de comunicação de dados e métricas operacionais',
            url = 'https://app.powerbi.com/view?r=eyJrIjoiYzUwMWVhZTItOWE4Yy00MDJjLWI0ZGMtZjU4MTM5MDllYWYxIiwidCI6ImE4MzQzZTdlLWNkNDEtNDZiNC1hNTNhLTUwZmQzMGY2YjA0OCJ9',
            ativo = true
        WHERE titulo ILIKE '%Comunicação de Dados%';
    ELSE
        INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
        VALUES (
            'Dashboard Operacional Comunicação de Dados',
            'Monitoramento de comunicação de dados e métricas operacionais',
            'https://app.powerbi.com/view?r=eyJrIjoiYzUwMWVhZTItOWE4Yy00MDJjLWI0ZGMtZjU4MTM5MDllYWYxIiwidCI6ImE4MzQzZTdlLWNkNDEtNDZiNC1hNTNhLTUwZmQzMGY2YjA0OCJ9',
            2,
            true
        );
    END IF;
END $$;

-- 2. Vincular Relatórios às Áreas Corretas (Limpa e Reatribui)
DO $$
DECLARE
    hc_id UUID;
    cd_id UUID;
BEGIN
    SELECT id INTO hc_id FROM public.powerbi_links WHERE titulo = 'Dashboard Operacional Home Connect' LIMIT 1;
    SELECT id INTO cd_id FROM public.powerbi_links WHERE titulo = 'Dashboard Operacional Comunicação de Dados' LIMIT 1;

    -- Home Connect
    IF hc_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_id],
            modules = ARRAY['dashboard', 'powerbi']
        WHERE area = 'Home Connect';
    END IF;

    -- Comunicação de Dados
    IF cd_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[cd_id],
            modules = ARRAY['dashboard', 'powerbi']
        WHERE area = 'Comunicação de Dados';
    END IF;

    -- Gerencia (Acesso a Ambos)
    IF hc_id IS NOT NULL AND cd_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_id, cd_id],
            all_access = true,
            modules = ARRAY['dashboard', 'powerbi']
        WHERE area = 'Gerencia';
    END IF;
    
    -- Suporte CL (Exemplo: Ver ambos mas não ter acesso total)
    IF hc_id IS NOT NULL AND cd_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_id, cd_id],
            modules = ARRAY['dashboard', 'powerbi']
        WHERE area = 'Suporte CL';
    END IF;

END $$;
