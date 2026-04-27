-- Reprocessa data_atividade dos registros existentes para usar dh_inicio_agendamento (com fallbacks)
UPDATE public.atividades_fato
SET data_atividade = COALESCE(
  -- 1) dh_inicio_agendamento
  NULLIF(
    CASE
      WHEN raw->>'dh_inicio_agendamento' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (substring(raw->>'dh_inicio_agendamento' from 1 for 10))::date
      WHEN raw->>'dh_inicio_agendamento' ~ '^\d{2}/\d{2}/\d{4}'
        THEN to_date(substring(raw->>'dh_inicio_agendamento' from 1 for 10), 'DD/MM/YYYY')
      ELSE NULL
    END,
    NULL
  ),
  -- 2) fallback: dh_dataaberturaos
  NULLIF(
    CASE
      WHEN raw->>'dh_dataaberturaos' ~ '^\d{4}-\d{2}-\d{2}'
        THEN (substring(raw->>'dh_dataaberturaos' from 1 for 10))::date
      WHEN raw->>'dh_dataaberturaos' ~ '^\d{2}/\d{2}/\d{4}'
        THEN to_date(substring(raw->>'dh_dataaberturaos' from 1 for 10), 'DD/MM/YYYY')
      ELSE NULL
    END,
    NULL
  ),
  -- 3) fallback: data_termino existente
  data_termino::date
)
WHERE TRUE;