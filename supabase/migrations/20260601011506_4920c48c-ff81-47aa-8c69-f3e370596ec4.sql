-- Bucket privado para bases compartilhadas do módulo Rastreabilidade ONT
INSERT INTO storage.buckets (id, name, public)
VALUES ('ont-bases', 'ont-bases', false)
ON CONFLICT (id) DO NOTHING;

-- Tabela de metadados (timestamp/qtd) das bases ONT
CREATE TABLE IF NOT EXISTS public.ont_bases_meta (
  base_type TEXT PRIMARY KEY,
  row_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT
);

GRANT SELECT ON public.ont_bases_meta TO authenticated;
GRANT ALL ON public.ont_bases_meta TO service_role;

ALTER TABLE public.ont_bases_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem meta ONT" ON public.ont_bases_meta;
CREATE POLICY "Autenticados leem meta ONT"
  ON public.ont_bases_meta FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin upsert meta ONT" ON public.ont_bases_meta;
CREATE POLICY "Admin upsert meta ONT"
  ON public.ont_bases_meta FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin update meta ONT" ON public.ont_bases_meta;
CREATE POLICY "Admin update meta ONT"
  ON public.ont_bases_meta FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin delete meta ONT" ON public.ont_bases_meta;
CREATE POLICY "Admin delete meta ONT"
  ON public.ont_bases_meta FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage policies para o bucket 'ont-bases'
-- INSERT também precisa de WITH CHECK em storage.objects (não USING).
DROP POLICY IF EXISTS "ONT bases read autenticados" ON storage.objects;
CREATE POLICY "ONT bases read autenticados"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ont-bases');

DROP POLICY IF EXISTS "ONT bases admin insert" ON storage.objects;
CREATE POLICY "ONT bases admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ont-bases' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ONT bases admin update" ON storage.objects;
CREATE POLICY "ONT bases admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ont-bases' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'ont-bases' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ONT bases admin delete" ON storage.objects;
CREATE POLICY "ONT bases admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ont-bases' AND public.has_role(auth.uid(), 'admin'));