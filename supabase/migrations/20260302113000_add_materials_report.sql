-- Adicionar o novo relatório "Dashboard Controle de Materiais"
-- Este relatório será exibido internamente via iframe conforme a configuração do sistema

INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
VALUES (
    'Dashboard Controle de Materiais',
    'Gestão e controle de inventário de materiais',
    'https://app.powerbi.com/view?r=eyJrIjoiZDNhNjRkNzQtYmRiYS00N2Y0LWEyOWMtNThhYTQzZGRlYjJlIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9',
    3,
    true
)
ON CONFLICT (url) DO UPDATE SET 
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    ativo = true;

-- Opcional: Atribuir automaticamente à Gerência para facilitar o teste inicial
DO $$
DECLARE
    new_report_id UUID;
    gerencia_reports UUID[];
BEGIN
    SELECT id INTO new_report_id FROM public.powerbi_links WHERE titulo = 'Dashboard Controle de Materiais' LIMIT 1;
    
    IF new_report_id IS NOT NULL THEN
        SELECT powerbi_report_ids INTO gerencia_reports FROM public.area_permissions WHERE area = 'Gerencia';
        
        -- Adiciona se não estiver na lista
        IF NOT (new_report_id = ANY(gerencia_reports)) THEN
            UPDATE public.area_permissions 
            SET powerbi_report_ids = array_append(powerbi_report_ids, new_report_id)
            WHERE area = 'Gerencia';
        END IF;
    END IF;
END $$;
