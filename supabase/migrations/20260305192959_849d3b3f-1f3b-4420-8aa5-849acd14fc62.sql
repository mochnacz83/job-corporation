
-- Cadastro de técnicos (uploaded via spreadsheet)
CREATE TABLE public.tecnicos_cadastro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tr TEXT,
  tt TEXT,
  nome_empresa TEXT,
  nome_tecnico TEXT NOT NULL,
  supervisor TEXT,
  coordenador TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL
);

ALTER TABLE public.tecnicos_cadastro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tecnicos" ON public.tecnicos_cadastro
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tecnicos" ON public.tecnicos_cadastro
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Admins can manage tecnicos" ON public.tecnicos_cadastro
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Cadastro de materiais (uploaded via spreadsheet)
CREATE TABLE public.materiais_cadastro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome_material TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL
);

ALTER TABLE public.materiais_cadastro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view materiais" ON public.materiais_cadastro
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert materiais" ON public.materiais_cadastro
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Admins can manage materiais" ON public.materiais_cadastro
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Main collection form
CREATE TABLE public.material_coletas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome_tecnico TEXT NOT NULL,
  atividade TEXT NOT NULL,
  tipo_aplicacao TEXT NOT NULL,
  circuito TEXT,
  ba TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.material_coletas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coletas" ON public.material_coletas
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coletas" ON public.material_coletas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all coletas" ON public.material_coletas
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage coletas" ON public.material_coletas
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Material items per collection
CREATE TABLE public.material_coleta_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coleta_id UUID NOT NULL REFERENCES public.material_coletas(id) ON DELETE CASCADE,
  codigo_material TEXT NOT NULL,
  nome_material TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  unidade TEXT NOT NULL DEFAULT 'Un',
  serial TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.material_coleta_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coleta items" ON public.material_coleta_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.material_coletas WHERE id = coleta_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can insert own coleta items" ON public.material_coleta_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.material_coletas WHERE id = coleta_id AND user_id = auth.uid())
  );

CREATE POLICY "Admins can view all coleta items" ON public.material_coleta_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage coleta items" ON public.material_coleta_items
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_material_coletas_updated_at
  BEFORE UPDATE ON public.material_coletas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
