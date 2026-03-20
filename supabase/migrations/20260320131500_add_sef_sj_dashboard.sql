-- Adicionar o novo relatório "DashBoard SEF São Jose"
-- Link: https://app.powerbi.com/view?r=eyJrIjoiM2NjZjRkNmMtOWY3Yy00ZmJmLTk2NjgtNTM2YWU0MGRmYmZjIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9&disablecdnExpiration=1770063969

INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
VALUES (
    'DashBoard SEF São Jose',
    'Monitoramento de indicadores SEF São Jose',
    'https://app.powerbi.com/view?r=eyJrIjoiM2NjZjRkNmMtOWY3Yy00ZmJmLTk2NjgtNTM2YWU0MGRmYmZjIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9&disablecdnExpiration=1770063969',
    5,
    true
)
ON CONFLICT (url) DO UPDATE SET 
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    ativo = true;

-- Garantir que a área "SEF São Jose" exista
INSERT INTO public.area_permissions (area, all_access)
VALUES ('SEF São Jose', false)
ON CONFLICT (area) DO NOTHING;

-- Atribuir o relatório às áreas correspondentes
DO $$
DECLARE
    new_report_id UUID;
    gerencia_reports UUID[];
    sef_reports UUID[];
BEGIN
    SELECT id INTO new_report_id FROM public.powerbi_links WHERE url LIKE 'https://app.powerbi.com/view?r=eyJrIjoiM2NjZjRkNmMtOWY3Yy00ZmJmLTk2NjgtNTM2YWU0MGRmYmZjI%' LIMIT 1;
    
    IF new_report_id IS NOT NULL THEN
        -- 1. Atualizar Gerencia
        SELECT powerbi_report_ids INTO gerencia_reports FROM public.area_permissions WHERE area = 'Gerencia';
        IF gerencia_reports IS NULL THEN gerencia_reports := ARRAY[]::UUID[]; END IF;
        
        IF NOT (new_report_id = ANY(gerencia_reports)) THEN
            UPDATE public.area_permissions 
            SET powerbi_report_ids = array_append(powerbi_report_ids, new_report_id),
                modules = CASE WHEN 'powerbi' = ANY(modules) THEN modules ELSE array_append(modules, 'powerbi') END
            WHERE area = 'Gerencia';
        END IF;

        -- 2. Atualizar SEF São Jose
        SELECT powerbi_report_ids INTO sef_reports FROM public.area_permissions WHERE area = 'SEF São Jose';
        IF sef_reports IS NULL THEN sef_reports := ARRAY[]::UUID[]; END IF;
        
        IF NOT (new_report_id = ANY(sef_reports)) THEN
            UPDATE public.area_permissions 
            SET powerbi_report_ids = array_append(powerbi_report_ids, new_report_id),
                modules = CASE WHEN 'powerbi' = ANY(modules) THEN modules ELSE array_append(modules, 'powerbi') END
            WHERE area = 'SEF São Jose';
        END IF;
    END IF;
END $$;
