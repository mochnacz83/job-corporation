-- Allow users to delete their own coletas
CREATE POLICY "Users can delete own coletas"
ON public.material_coletas
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete items from their own coletas
CREATE POLICY "Users can delete own coleta items"
ON public.material_coleta_items
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM material_coletas
  WHERE material_coletas.id = material_coleta_items.coleta_id
  AND material_coletas.user_id = auth.uid()
));