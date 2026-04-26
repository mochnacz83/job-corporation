-- Desativa o cron antigo que tenta baixar do GCS (URL exige login Google) e estava poluindo o log de sincronismo
SELECT cron.unschedule(1);

-- Limpa registros zumbis (sem data_atividade) que ficaram da importação anterior, eles nunca apareciam no painel
DELETE FROM public.atividades_fato WHERE data_atividade IS NULL;