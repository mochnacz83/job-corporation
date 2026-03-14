-- Create reagenda_history table for rescheduling imports
CREATE TABLE IF NOT EXISTS public.reagenda_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sa TEXT,
  setor TEXT,
  nome TEXT NOT NULL,
  contato TEXT NOT NULL,
  operadora TEXT,
  tipo_atividade TEXT,
  data_agendamento TEXT,
  data_original_formatada TEXT,
  data_nova TEXT,
  status TEXT NOT NULL DEFAULT 'Pendente',
  decisao TEXT NOT NULL DEFAULT 'Pendente',
  periodo TEXT NOT NULL DEFAULT '',
  horario TEXT NOT NULL DEFAULT '',
  selecionado BOOLEAN NOT NULL DEFAULT false,
  deleted_by_user BOOLEAN NOT NULL DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  is_manual_status BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep table up-to-date if it already existed partially
ALTER TABLE public.reagenda_history
  ADD COLUMN IF NOT EXISTS periodo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS horario TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS deleted_by_user BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manual_status BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_reagenda_history_user_id ON public.reagenda_history(user_id);
CREATE INDEX IF NOT EXISTS idx_reagenda_history_deleted ON public.reagenda_history(deleted_by_user);
CREATE INDEX IF NOT EXISTS idx_reagenda_history_created_at ON public.reagenda_history(created_at);

-- Enable RLS
ALTER TABLE public.reagenda_history ENABLE ROW LEVEL SECURITY;

-- Recreate policies cleanly
DROP POLICY IF EXISTS "Users can view own reagenda history" ON public.reagenda_history;
CREATE POLICY "Users can view own reagenda history"
ON public.reagenda_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all reagenda history" ON public.reagenda_history;
CREATE POLICY "Admins can view all reagenda history"
ON public.reagenda_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can insert own reagenda history" ON public.reagenda_history;
CREATE POLICY "Users can insert own reagenda history"
ON public.reagenda_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reagenda history" ON public.reagenda_history;
CREATE POLICY "Users can update own reagenda history"
ON public.reagenda_history
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update all reagenda history" ON public.reagenda_history;
CREATE POLICY "Admins can update all reagenda history"
ON public.reagenda_history
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete all reagenda history" ON public.reagenda_history;
CREATE POLICY "Admins can delete all reagenda history"
ON public.reagenda_history
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at maintenance
DROP TRIGGER IF EXISTS trg_reagenda_history_updated_at ON public.reagenda_history;
CREATE TRIGGER trg_reagenda_history_updated_at
BEFORE UPDATE ON public.reagenda_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();