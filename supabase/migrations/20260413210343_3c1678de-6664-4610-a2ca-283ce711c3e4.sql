
-- Drop the restrictive SELECT policy for regular users
DROP POLICY IF EXISTS "Users can view own uploaded tecnicos" ON public.tecnicos_cadastro;

-- Create a new policy allowing all authenticated users to view all tecnicos
CREATE POLICY "Authenticated can view all tecnicos"
ON public.tecnicos_cadastro
FOR SELECT
TO authenticated
USING (true);
