-- Create RAW tables for BI uploads
CREATE TABLE IF NOT EXISTS public.raw_b2b (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    designacao TEXT,
    protocolo TEXT,
    cliente TEXT,
    produto TEXT,
    data_abertura TIMESTAMP WITH TIME ZONE,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    uf TEXT,
    municipio TEXT,
    tecnologia_acesso TEXT,
    posto_encerramento TEXT,
    posto_anterior TEXT,
    cldv NUMERIC,
    causa_ofensora_n1 TEXT,
    causa_ofensora_n2 TEXT,
    causa_ofensora_n3 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.raw_vip_tmr (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    circuito TEXT,
    tmr NUMERIC,
    tmr_pend_vtal NUMERIC,
    tmr_pend_oi NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.raw_vip_prazo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    circuito TEXT,
    reparo_prazo TEXT,
    posto_prazo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.raw_vip_repetida (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    circuito TEXT,
    rep TEXT,
    retido TEXT,
    tempo_repetida NUMERIC,
    faixa_repetida TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fact Table
CREATE TABLE IF NOT EXISTS public.fato_reparos (
    chave_reparo TEXT PRIMARY KEY,
    protocolo TEXT,
    designacao TEXT,
    cliente TEXT,
    produto TEXT,
    data_abertura TIMESTAMP WITH TIME ZONE,
    data_fechamento TIMESTAMP WITH TIME ZONE,
    uf TEXT,
    municipio TEXT,
    tecnologia_acesso TEXT,
    posto_encerramento TEXT,
    posto_anterior TEXT,
    posto_prazo TEXT,
    rep TEXT,
    retido TEXT,
    reparo_prazo TEXT,
    tmr NUMERIC,
    tmr_real NUMERIC,
    cldv NUMERIC,
    causa_ofensora_n1 TEXT,
    causa_ofensora_n2 TEXT,
    causa_ofensora_n3 TEXT,
    tempo_repetida NUMERIC,
    faixa_repetida TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for Fact Table
CREATE INDEX IF NOT EXISTS idx_fato_reparos_data_abertura ON public.fato_reparos(data_abertura);
CREATE INDEX IF NOT EXISTS idx_fato_reparos_designacao ON public.fato_reparos(designacao);
CREATE INDEX IF NOT EXISTS idx_fato_reparos_protocolo ON public.fato_reparos(protocolo);

-- Enable RLS
ALTER TABLE public.raw_b2b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_vip_tmr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_vip_prazo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_vip_repetida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fato_reparos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow read for authenticated users" ON public.fato_reparos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on raw_b2b" ON public.raw_b2b FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on raw_vip_tmr" ON public.raw_vip_tmr FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on raw_vip_prazo" ON public.raw_vip_prazo FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on raw_vip_repetida" ON public.raw_vip_repetida FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on fato_reparos" ON public.fato_reparos FOR ALL TO authenticated USING (true);
