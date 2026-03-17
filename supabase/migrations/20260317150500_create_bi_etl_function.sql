-- Create ETL Function to process raw tables into fato_reparos
CREATE OR REPLACE FUNCTION public.process_bi_etl()
RETURNS void AS $body
BEGIN
  INSERT INTO public.fato_reparos (
    chave_reparo,
    protocolo,
    designacao,
    cliente,
    produto,
    data_abertura,
    data_fechamento,
    uf,
    municipio,
    tecnologia_acesso,
    posto_encerramento,
    posto_anterior,
    cldv,
    causa_ofensora_n1,
    causa_ofensora_n2,
    causa_ofensora_n3,
    tmr,
    tmr_real,
    reparo_prazo,
    posto_prazo,
    rep,
    retido,
    tempo_repetida,
    faixa_repetida,
    updated_at
  )
  SELECT 
    COALESCE(b.designacao, '') || '_' || COALESCE(b.protocolo, '') || '_' || COALESCE(to_char(b.data_abertura, 'YYYYMMDD'), '') AS chave_reparo,
    b.protocolo,
    b.designacao,
    b.cliente,
    b.produto,
    b.data_abertura,
    b.data_fechamento,
    b.uf,
    b.municipio,
    b.tecnologia_acesso,
    b.posto_encerramento,
    b.posto_anterior,
    b.cldv,
    b.causa_ofensora_n1,
    b.causa_ofensora_n2,
    b.causa_ofensora_n3,
    t.tmr,
    (COALESCE(t.tmr, 0) - COALESCE(t.tmr_pend_vtal, 0) - COALESCE(t.tmr_pend_oi, 0)) AS tmr_real,
    p.reparo_prazo,
    p.posto_prazo,
    r.rep,
    r.retido,
    r.tempo_repetida,
    r.faixa_repetida,
    now() as updated_at
  FROM public.raw_b2b b
  LEFT JOIN public.raw_vip_tmr t ON b.designacao = t.circuito
  LEFT JOIN public.raw_vip_prazo p ON b.designacao = p.circuito
  LEFT JOIN public.raw_vip_repetida r ON b.designacao = r.circuito
  ON CONFLICT (chave_reparo) DO UPDATE SET
    protocolo = EXCLUDED.protocolo,
    designacao = EXCLUDED.designacao,
    cliente = EXCLUDED.cliente,
    produto = EXCLUDED.produto,
    data_abertura = EXCLUDED.data_abertura,
    data_fechamento = EXCLUDED.data_fechamento,
    uf = EXCLUDED.uf,
    municipio = EXCLUDED.municipio,
    tecnologia_acesso = EXCLUDED.tecnologia_acesso,
    posto_encerramento = EXCLUDED.posto_encerramento,
    posto_anterior = EXCLUDED.posto_anterior,
    cldv = EXCLUDED.cldv,
    causa_ofensora_n1 = EXCLUDED.causa_ofensora_n1,
    causa_ofensora_n2 = EXCLUDED.causa_ofensora_n2,
    causa_ofensora_n3 = EXCLUDED.causa_ofensora_n3,
    tmr = EXCLUDED.tmr,
    tmr_real = EXCLUDED.tmr_real,
    reparo_prazo = EXCLUDED.reparo_prazo,
    posto_prazo = EXCLUDED.posto_prazo,
    rep = EXCLUDED.rep,
    retido = EXCLUDED.retido,
    tempo_repetida = EXCLUDED.tempo_repetida,
    faixa_repetida = EXCLUDED.faixa_repetida,
    updated_at = EXCLUDED.updated_at;
END;
$body LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.clear_raw_tables()
RETURNS void AS $body
BEGIN
  TRUNCATE TABLE public.raw_b2b;
  TRUNCATE TABLE public.raw_vip_tmr;
  TRUNCATE TABLE public.raw_vip_prazo;
  TRUNCATE TABLE public.raw_vip_repetida;
END;
$body LANGUAGE plpgsql;
