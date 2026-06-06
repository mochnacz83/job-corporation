
-- fato_reparos: restrict writes to admins, keep SELECT for authenticated
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.fato_reparos;
DROP POLICY IF EXISTS "Authenticated users can read fato_reparos" ON public.fato_reparos;
DROP POLICY IF EXISTS "Admins can manage fato_reparos" ON public.fato_reparos;

CREATE POLICY "Authenticated users can read fato_reparos"
  ON public.fato_reparos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fato_reparos"
  ON public.fato_reparos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_b2b
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.raw_b2b;
DROP POLICY IF EXISTS "Authenticated users can read raw_b2b" ON public.raw_b2b;
DROP POLICY IF EXISTS "Admins can manage raw_b2b" ON public.raw_b2b;
CREATE POLICY "Authenticated users can read raw_b2b"
  ON public.raw_b2b FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage raw_b2b"
  ON public.raw_b2b FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_prazo
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.raw_vip_prazo;
DROP POLICY IF EXISTS "Authenticated users can read raw_vip_prazo" ON public.raw_vip_prazo;
DROP POLICY IF EXISTS "Admins can manage raw_vip_prazo" ON public.raw_vip_prazo;
CREATE POLICY "Authenticated users can read raw_vip_prazo"
  ON public.raw_vip_prazo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage raw_vip_prazo"
  ON public.raw_vip_prazo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_repetida
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.raw_vip_repetida;
DROP POLICY IF EXISTS "Authenticated users can read raw_vip_repetida" ON public.raw_vip_repetida;
DROP POLICY IF EXISTS "Admins can manage raw_vip_repetida" ON public.raw_vip_repetida;
CREATE POLICY "Authenticated users can read raw_vip_repetida"
  ON public.raw_vip_repetida FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage raw_vip_repetida"
  ON public.raw_vip_repetida FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_tmr
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.raw_vip_tmr;
DROP POLICY IF EXISTS "Authenticated users can read raw_vip_tmr" ON public.raw_vip_tmr;
DROP POLICY IF EXISTS "Admins can manage raw_vip_tmr" ON public.raw_vip_tmr;
CREATE POLICY "Authenticated users can read raw_vip_tmr"
  ON public.raw_vip_tmr FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage raw_vip_tmr"
  ON public.raw_vip_tmr FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- material-fotos storage: add UPDATE policy scoped to owner folder
DROP POLICY IF EXISTS "Users can update own material photos" ON storage.objects;
CREATE POLICY "Users can update own material photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'material-fotos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'material-fotos' AND (storage.foldername(name))[1] = auth.uid()::text);
