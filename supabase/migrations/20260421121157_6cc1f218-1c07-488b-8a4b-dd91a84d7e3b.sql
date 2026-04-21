-- Restrict writes on inventory_submission_items to admins or owners of parent submission
DROP POLICY IF EXISTS "Permitir tudo para administradores no inventory_submission_item" ON public.inventory_submission_items;

-- Admins can do anything
CREATE POLICY "Admins can manage inventory_submission_items"
ON public.inventory_submission_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Owners (creator of parent submission) can insert items into their own submission
CREATE POLICY "Owners can insert items for own submission"
ON public.inventory_submission_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventory_submissions s
    WHERE s.id = inventory_submission_items.submission_id
      AND s.user_id = auth.uid()
  )
);

-- Owners can update items belonging to their own submission
CREATE POLICY "Owners can update items for own submission"
ON public.inventory_submission_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventory_submissions s
    WHERE s.id = inventory_submission_items.submission_id
      AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventory_submissions s
    WHERE s.id = inventory_submission_items.submission_id
      AND s.user_id = auth.uid()
  )
);

-- Owners can delete items belonging to their own submission
CREATE POLICY "Owners can delete items for own submission"
ON public.inventory_submission_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventory_submissions s
    WHERE s.id = inventory_submission_items.submission_id
      AND s.user_id = auth.uid()
  )
);
