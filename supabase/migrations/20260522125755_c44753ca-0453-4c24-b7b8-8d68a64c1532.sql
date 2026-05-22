UPDATE public.atividades_fato
SET data_atividade = COALESCE(
  NULLIF(substring(raw->>'data_naf' from '^\d{4}-\d{2}-\d{2}'), '')::date,
  NULLIF(substring(raw->>'dh_dataaberturaos' from '^\d{4}-\d{2}-\d{2}'), '')::date,
  NULLIF(substring(raw->>'dh_abertura_ba' from '^\d{4}-\d{2}-\d{2}'), '')::date,
  NULLIF(substring(raw->>'dh_inicio_agendamento' from '^\d{4}-\d{2}-\d{2}'), '')::date
)
WHERE data_atividade IS NULL;