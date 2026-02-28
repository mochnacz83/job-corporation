-- Clear existing links for testing/demo purposes if needed, or simply update/insert
-- To ensure consistency with the user's latest request:

-- 1. Rename the first report if it exists
UPDATE public.powerbi_links 
SET titulo = 'Dashboard Operacional Home Connect', 
    descricao = 'Visualização operacional detalhada Home Connect'
WHERE id = (SELECT id FROM public.powerbi_links ORDER BY created_at ASC LIMIT 1);

-- 2. Insert or Update the second report
-- Using a subquery check to avoid duplicates if this migration runs multiple times
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.powerbi_links WHERE titulo = 'Dashboard Operacional de Comunicação de Dados') THEN
        INSERT INTO public.powerbi_links (titulo, descricao, url, ordem, ativo)
        VALUES (
            'Dashboard Operacional de Comunicação de Dados',
            'Monitoramento de comunicação de dados e métricas operacionais',
            'https://app.powerbi.com/view?r=eyJrIjoiYzUwMWVhZTItOWE4Yy00MDJjLWI0ZGMtZjU4MTM5MDllYWYxIiwidCI6ImE4MzQzZTdlLWNkNDEtNDZiNC1hNTNhLTUwZmQzMGY2YjA0OCJ9',
            2,
            true
        );
    END IF;
END $$;
