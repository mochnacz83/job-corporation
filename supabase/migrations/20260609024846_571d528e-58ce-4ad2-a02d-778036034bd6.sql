
-- Restrict write access on operational raw/ETL tables to admins only.
-- Reads remain available to authenticated users (existing dashboards/ETL).
-- Edge functions using the service role key bypass RLS and continue to work.

-- raw_b2b
DROP POLICY IF EXISTS "Allow all B2B" ON public.raw_b2b;
CREATE POLICY "Authenticated can read raw_b2b"
  ON public.raw_b2b FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write raw_b2b"
  ON public.raw_b2b FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_prazo
DROP POLICY IF EXISTS "Allow all Prazo" ON public.raw_vip_prazo;
CREATE POLICY "Authenticated can read raw_vip_prazo"
  ON public.raw_vip_prazo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write raw_vip_prazo"
  ON public.raw_vip_prazo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_repetida
DROP POLICY IF EXISTS "Allow all Repetida" ON public.raw_vip_repetida;
CREATE POLICY "Authenticated can read raw_vip_repetida"
  ON public.raw_vip_repetida FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write raw_vip_repetida"
  ON public.raw_vip_repetida FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- raw_vip_tmr
DROP POLICY IF EXISTS "Allow all TMR" ON public.raw_vip_tmr;
CREATE POLICY "Authenticated can read raw_vip_tmr"
  ON public.raw_vip_tmr FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write raw_vip_tmr"
  ON public.raw_vip_tmr FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- fato_reparos
DROP POLICY IF EXISTS "Allow all Fato" ON public.fato_reparos;
CREATE POLICY "Authenticated can read fato_reparos"
  ON public.fato_reparos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can write fato_reparos"
  ON public.fato_reparos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
