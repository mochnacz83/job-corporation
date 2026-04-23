-- Fix infinite recursion in material_coleta_items INSERT policy.
-- The previous policy had an EXISTS subquery referencing material_coleta_items itself,
-- which Postgres evaluates while checking the row being inserted -> recursion.
-- We replace it with a SECURITY DEFINER helper that bypasses RLS for the existence check.

CREATE OR REPLACE FUNCTION public.material_coleta_has_items(_coleta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.material_coleta_items WHERE coleta_id = _coleta_id
  );
$$;

DROP POLICY IF EXISTS "Users can insert own coleta items" ON public.material_coleta_items;

CREATE POLICY "Users can insert own coleta items"
ON public.material_coleta_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.material_coletas mc
    WHERE mc.id = material_coleta_items.coleta_id
      AND mc.user_id = auth.uid()
      AND (
        (mc.edit_unlocked = true AND mc.post_edit_locked = false)
        OR NOT public.material_coleta_has_items(mc.id)
      )
  )
);