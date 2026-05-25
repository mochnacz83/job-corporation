-- Create public.justificativas_10h table for technician 10 AM closure justifications
CREATE TABLE IF NOT EXISTS public.justificativas_10h (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matricula_tt TEXT NOT NULL,
    nome_tecnico TEXT NOT NULL,
    supervisor TEXT,
    coordenador TEXT,
    setor TEXT,
    data_atividade DATE NOT NULL,
    causa TEXT NOT NULL, -- "Inversão de atividade", "Cancelamento", etc.
    observacao TEXT,
    bloqueado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    UNIQUE(matricula_tt, data_atividade)
);

-- Enable RLS
ALTER TABLE public.justificativas_10h ENABLE ROW LEVEL SECURITY;

-- Simple access policies: Authenticated users can read, insert and update.
CREATE POLICY "Permitir tudo para autenticados no justificativas_10h"
ON public.justificativas_10h FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
