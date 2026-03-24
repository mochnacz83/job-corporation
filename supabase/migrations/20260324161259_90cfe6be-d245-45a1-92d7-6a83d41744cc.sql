CREATE POLICY "Users can update own coletas"
ON public.material_coletas
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);