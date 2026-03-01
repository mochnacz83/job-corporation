-- Create area_permissions table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'area_permissions') THEN
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
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view area_permissions') THEN
            CREATE POLICY "Anyone can view area_permissions"
              ON public.area_permissions FOR SELECT
              TO authenticated
              USING (true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage area_permissions') THEN
            CREATE POLICY "Admins can manage area_permissions"
              ON public.area_permissions FOR ALL
              TO authenticated
              USING (public.has_role(auth.uid(), 'admin'))
              WITH CHECK (public.has_role(auth.uid(), 'admin'));
        END IF;

        -- Seed initial areas only if table was just created
        INSERT INTO public.area_permissions (area, all_access)
        VALUES 
          ('Comunicação de Dados', false),
          ('Home Connect', false),
          ('Gerencia', true),
          ('Suporte CL', false)
        ON CONFLICT (area) DO NOTHING;

        -- Trigger for updated_at
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
            CREATE TRIGGER update_area_permissions_updated_at
            BEFORE UPDATE ON public.area_permissions
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
        END IF;
    END IF;
END $$;
