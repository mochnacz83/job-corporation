-- Create area_permissions table
CREATE TABLE public.area_permissions (
  area TEXT PRIMARY KEY,
  modules TEXT[] DEFAULT '{}',
  powerbi_report_ids UUID[] DEFAULT '{}',
  all_access BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.area_permissions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view area_permissions"
  ON public.area_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage area_permissions"
  ON public.area_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed initial areas
INSERT INTO public.area_permissions (area, all_access)
VALUES 
  ('Comunicação de Dados', false),
  ('Home Connect', false),
  ('Gerencia', true),
  ('Suporte CL', false)
ON CONFLICT (area) DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_area_permissions_updated_at
BEFORE UPDATE ON public.area_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
