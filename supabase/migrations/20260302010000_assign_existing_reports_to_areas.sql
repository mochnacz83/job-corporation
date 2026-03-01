-- 1. Garante que os relatórios existam (conforme migração anterior)
-- 2. Associa o relatório "Home Connect" à área "Home Connect"
-- 3. Associa o relatório "Comunicação de Dados" à área "Comunicação de Dados"

DO $$
DECLARE
    hc_report_id UUID;
    cd_report_id UUID;
BEGIN
    -- Busca os IDs dos relatórios atuais
    SELECT id INTO hc_report_id FROM public.powerbi_links WHERE titulo ILIKE '%Home Connect%' LIMIT 1;
    SELECT id INTO cd_report_id FROM public.powerbi_links WHERE titulo ILIKE '%Comunicação de Dados%' LIMIT 1;

    -- Atualiza as permissões da área Home Connect
    IF hc_report_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_report_id],
            modules = CASE WHEN 'powerbi' = ANY(modules) THEN modules ELSE array_append(modules, 'powerbi') END
        WHERE area = 'Home Connect';
    END IF;

    -- Atualiza as permissões da área Comunicação de Dados
    IF cd_report_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[cd_report_id],
            modules = CASE WHEN 'powerbi' = ANY(modules) THEN modules ELSE array_append(modules, 'powerbi') END
        WHERE area = 'Comunicação de Dados';
    END IF;

    -- Garante que Gerencia tenha ambos
    IF hc_report_id IS NOT NULL AND cd_report_id IS NOT NULL THEN
        UPDATE public.area_permissions 
        SET powerbi_report_ids = ARRAY[hc_report_id, cd_report_id],
            all_access = true
        WHERE area = 'Gerencia';
    END IF;

END $$;
