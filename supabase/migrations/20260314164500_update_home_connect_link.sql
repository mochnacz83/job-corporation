-- Atualiza o link do Power BI - Dashboard Operacional Home Connect
-- Data: 2026-03-14

UPDATE public.powerbi_links 
SET url = 'https://app.powerbi.com/view?r=eyJrIjoiMmFmOWU0YWMtNzMyYy00MzczLTk1YTYtNjA5ZGY2ZjY2YjdiIiwidCI6ImE4MzQzZTdlLWNkNDEtNDZiNC1hNTNhLTUwZmQzMGY2YjA0OCJ9'
WHERE titulo = 'Dashboard Operacional Home Connect';

COMMENT ON TABLE public.powerbi_links IS 'Links dos relatórios Power BI. Atualizado link do Home Connect em 2026-03-14.';
