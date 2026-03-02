-- 1. Identificar Duplicatas e Manter Apenas 1 de cada
-- Dashboard Operacional Home Connect
-- Dashboard Operacional Comunicação de Dados

DO $$
DECLARE
    hc_keep_id UUID;
    cd_keep_id UUID;
BEGIN
    -- Identificar o ID mais recente do Home Connect para manter
    SELECT id INTO hc_keep_id 
    FROM public.powerbi_links 
    WHERE titulo = 'Dashboard Operacional Home Connect' 
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Identificar o ID mais recente da Comunicação de Dados para manter
    SELECT id INTO cd_keep_id 
    FROM public.powerbi_links 
    WHERE titulo = 'Dashboard Operacional Comunicação de Dados' 
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Desativar todos os outros que tenham os mesmos títulos ou URLs duplicados
    UPDATE public.powerbi_links 
    SET ativo = false 
    WHERE id NOT IN (COALESCE(hc_keep_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(cd_keep_id, '00000000-0000-0000-0000-000000000000'::UUID))
    AND (titulo = 'Dashboard Operacional Home Connect' OR titulo = 'Dashboard Operacional Comunicação de Dados');

    -- Se existirem outros relatórios com nomes genéricos (ex: 'Relatório Power BI'), desative também para evitar confusão
    UPDATE public.powerbi_links 
    SET ativo = false 
    WHERE (titulo = 'Relatório Power BI' OR titulo = 'Dashboard de Vendas')
    AND id NOT IN (COALESCE(hc_keep_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(cd_keep_id, '00000000-0000-0000-0000-000000000000'::UUID));

    -- 2. Corrigir as permissões de área para apontar para os IDs que mantivemos
    -- Home Connect
    IF hc_keep_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_keep_id]
        WHERE area = 'Home Connect';
    END IF;

    -- Comunicação de Dados
    IF cd_keep_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[cd_keep_id]
        WHERE area = 'Comunicação de Dados';
    END IF;

    -- Gerencia (Acesso a ambos)
    IF hc_keep_id IS NOT NULL AND cd_keep_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_keep_id, cd_keep_id],
            all_access = true
        WHERE area = 'Gerencia';
    END IF;

END $$;
