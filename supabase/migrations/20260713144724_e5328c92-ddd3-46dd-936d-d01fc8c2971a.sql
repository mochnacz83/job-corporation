
-- Drop broad SELECT policies that override owner scoping
DROP POLICY IF EXISTS "Permitir leitura para todos os autenticados no inventory_submis" ON public.inventory_submissions;
DROP POLICY IF EXISTS "Permitir leitura para todos os autenticados no inventory_submis" ON public.inventory_submission_items;
DROP POLICY IF EXISTS "Authenticated can view all coletas" ON public.material_coletas;
DROP POLICY IF EXISTS "Authenticated can view all coleta items" ON public.material_coleta_items;

-- Add owner SELECT policy for inventory_submissions (owner + admin can read)
CREATE POLICY "Owners can view own inventory_submissions"
ON public.inventory_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners can view own inventory_submission_items"
ON public.inventory_submission_items
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inventory_submissions s
  WHERE s.id = inventory_submission_items.submission_id AND s.user_id = auth.uid()
));

-- Tighten quality_records: only admins can read
DROP POLICY IF EXISTS "Authenticated users can view quality records" ON public.quality_records;
CREATE POLICY "Admins can view quality records"
ON public.quality_records
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Tighten vistorias_campo: owner + admin only
DROP POLICY IF EXISTS "Authenticated can read vistorias_campo" ON public.vistorias_campo;
CREATE POLICY "Owners can view own vistorias_campo"
ON public.vistorias_campo
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
