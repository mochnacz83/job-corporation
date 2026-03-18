-- Remover o relatório "BI Gerencial Nativo (Reparos)" e referências associadas
-- Este relatório foi substituído por soluções externas do Power BI.

DO $$
DECLARE
    old_report_id UUID;
BEGIN
    -- Busca o ID do relatório pelo título ou URL antigo
    SELECT id INTO old_report_id FROM public.powerbi_links 
    WHERE titulo = 'BI Gerencial Nativo (Reparos)' OR url = '/relatorio-gerencial' LIMIT 1;
    
    IF old_report_id IS NOT NULL THEN
        -- Remove das permissões de área
        UPDATE public.area_permissions 
        SET powerbi_report_ids = array_remove(powerbi_report_ids, old_report_id);
        
        -- Remove o link da tabela principal
        DELETE FROM public.powerbi_links WHERE id = old_report_id;
    END IF;
END $$;
