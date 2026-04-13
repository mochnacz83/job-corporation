
-- Remove old INSERT policy for regular users
DROP POLICY IF EXISTS "Authenticated users can insert tecnicos" ON public.tecnicos_cadastro;
