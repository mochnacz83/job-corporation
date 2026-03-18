-- Adicionar o novo relatório "Filas de Serviços - Instalação, Reparo e Mudança"
-- Este relatório exibe o monitoramento de filas para os serviços técnicos.

INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
VALUES (
    'Filas de Serviços - Instalação, Reparo e Mudança',
    'Monitoramento de filas de serviços para instalação, reparo e mudança de endereço.',
    'https://app.powerbi.com/view?r=eyJrIjoiYmMzZDIyNGYtMDRmMy00NDExLTlhNTctMjNkYzIxNzU5M2RmIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9',
    4,
    true
)
ON CONFLICT (url) DO UPDATE SET 
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    ativo = true;

-- Atribuir automaticamente à Gerência para garantir visibilidade
DO $$
DECLARE
    new_report_id UUID;
    gerencia_reports UUID[];
BEGIN
    SELECT id INTO new_report_id FROM public.powerbi_links WHERE url = 'https://app.powerbi.com/view?r=eyJrIjoiYmMzZDIyNGYtMDRmMy00NDExLTlhNTctMjNkYzIxNzU5M2RmIiwidCI6ImExMjEzYzlhLTAzZTAtNGI0OC05YTVlLTFkZmYzZmVjNTRlMCJ9' LIMIT 1;
    
    IF new_report_id IS NOT NULL THEN
        SELECT powerbi_report_ids INTO gerencia_reports FROM public.area_permissions WHERE area = 'Gerencia';
        
        -- Inicializa se for nulo
        IF gerencia_reports IS NULL THEN
            gerencia_reports := ARRAY[]::UUID[];
        END IF;

        -- Adiciona se não estiver na lista
        IF NOT (new_report_id = ANY(gerencia_reports)) THEN
            UPDATE public.area_permissions 
            SET powerbi_report_ids = array_append(powerbi_report_ids, new_report_id)
            WHERE area = 'Gerencia';
        END IF;
    END IF;
END $$;
