-- Fix 1: Remove overly permissive policy on inventory_submissions
-- The existing "Permitir tudo para administradores" policy uses true/true which gives ALL users full access.
-- Replace with proper admin-only policy and keep owner-scoped policies.
DROP POLICY IF EXISTS "Permitir tudo para administradores no inventory_submissions" ON public.inventory_submissions;

-- Admins can do everything
CREATE POLICY "Admins can manage inventory_submissions"
ON public.inventory_submissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Owners can insert their own submissions
CREATE POLICY "Owners can insert own inventory_submissions"
ON public.inventory_submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Owners can update their own submissions
CREATE POLICY "Owners can update own inventory_submissions"
ON public.inventory_submissions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own submissions
CREATE POLICY "Owners can delete own inventory_submissions"
ON public.inventory_submissions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Fix 2: Restrict material-fotos bucket SELECT to authenticated users only
-- Prevents anonymous bucket enumeration/listing while keeping the bucket usable for authenticated app users.
DROP POLICY IF EXISTS "Anyone can view material photos" ON storage.objects;

CREATE POLICY "Authenticated users can view material photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'material-fotos');