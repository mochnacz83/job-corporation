
-- tecnicos_inicio_dia: scope INSERT/UPDATE to row owner (created_by_user) or admin
DROP POLICY IF EXISTS "Authenticated can insert tecnicos_inicio_dia" ON public.tecnicos_inicio_dia;
DROP POLICY IF EXISTS "Authenticated can update tecnicos_inicio_dia" ON public.tecnicos_inicio_dia;

CREATE POLICY "Users insert own inicio_dia"
  ON public.tecnicos_inicio_dia
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own inicio_dia"
  ON public.tecnicos_inicio_dia
  FOR UPDATE
  TO authenticated
  USING (created_by_user = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by_user = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- justificativas_10h: scope INSERT to owner or admin
DROP POLICY IF EXISTS "Authenticated can insert justificativas_10h" ON public.justificativas_10h;

CREATE POLICY "Users insert own justificativas"
  ON public.justificativas_10h
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- material_coletas: harden UPDATE WITH CHECK to prevent unlocking via self-update
DROP POLICY IF EXISTS "Users can update own coletas" ON public.material_coletas;

CREATE POLICY "Users can update own coletas"
  ON public.material_coletas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND post_edit_locked = false)
  WITH CHECK (auth.uid() = user_id AND post_edit_locked = false);
