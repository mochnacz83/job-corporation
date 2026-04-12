
CREATE TABLE public.materiais_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  nome_material TEXT NOT NULL,
  segmento TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.materiais_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view materiais_inventario"
ON public.materiais_inventario
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage materiais_inventario"
ON public.materiais_inventario
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
