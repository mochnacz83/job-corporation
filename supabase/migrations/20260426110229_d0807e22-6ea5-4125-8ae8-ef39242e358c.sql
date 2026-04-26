-- Reprocessa a coluna data_atividade dos 1420 registros já importados,
-- usando o campo data_naf que já está armazenado no JSON raw.
UPDATE public.atividades_fato
SET data_atividade = (
  CASE
    WHEN raw->>'data_naf' ~ '^\d{4}-\d{2}-\d{2}'
      THEN substring(raw->>'data_naf' from 1 for 10)::date
    WHEN raw->>'dh_dataaberturaos' ~ '^\d{4}-\d{2}-\d{2}'
      THEN substring(raw->>'dh_dataaberturaos' from 1 for 10)::date
    WHEN raw->>'dh_abertura_ba' ~ '^\d{4}-\d{2}-\d{2}'
      THEN substring(raw->>'dh_abertura_ba' from 1 for 10)::date
    ELSE NULL
  END
),
matricula_tt = COALESCE(NULLIF(matricula_tt, ''), UPPER(NULLIF(TRIM(raw->>'cd_matricula_tecnico'), '')))
WHERE data_atividade IS NULL;