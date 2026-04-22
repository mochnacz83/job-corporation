
DROP POLICY IF EXISTS "Users can update own coletas" ON public.material_coletas;
CREATE POLICY "Users can update own coletas"
  ON public.material_coletas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND post_edit_locked = false)
  WITH CHECK (auth.uid() = user_id AND post_edit_locked = false);
