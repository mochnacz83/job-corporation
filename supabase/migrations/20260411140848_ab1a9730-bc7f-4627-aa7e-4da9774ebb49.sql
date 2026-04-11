
-- 1. Fix vistorias_campo: restrict to authenticated users
DROP POLICY IF EXISTS "Enable insert for all" ON public.vistorias_campo;
DROP POLICY IF EXISTS "Enable read for all" ON public.vistorias_campo;

CREATE POLICY "Authenticated can read vistorias_campo"
ON public.vistorias_campo FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can insert own vistorias_campo"
ON public.vistorias_campo FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vistorias_campo"
ON public.vistorias_campo FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage vistorias_campo"
ON public.vistorias_campo FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. Fix inventory_base: restrict writes to admin
DROP POLICY IF EXISTS "Permitir tudo para administradores no inventory_base" ON public.inventory_base;

CREATE POLICY "Authenticated can read inventory_base"
ON public.inventory_base FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage inventory_base"
ON public.inventory_base FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Fix tecnicos_indicadores: restrict writes
DROP POLICY IF EXISTS "Authenticated can insert indicadores" ON public.tecnicos_indicadores;
DROP POLICY IF EXISTS "Authenticated can update indicadores" ON public.tecnicos_indicadores;

CREATE POLICY "Admins or uploader can insert indicadores"
ON public.tecnicos_indicadores FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = uploaded_by);

CREATE POLICY "Admins or uploader can update indicadores"
ON public.tecnicos_indicadores FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = uploaded_by);

-- 4. Fix tecnicos_cadastro: restrict phone/personal data reads
DROP POLICY IF EXISTS "Authenticated users can view tecnicos" ON public.tecnicos_cadastro;

CREATE POLICY "Admins can view all tecnicos"
ON public.tecnicos_cadastro FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own uploaded tecnicos"
ON public.tecnicos_cadastro FOR SELECT TO authenticated
USING (auth.uid() = uploaded_by);

-- 5. Add missing update policy for material_coleta_items
CREATE POLICY "Users can update own coleta items"
ON public.material_coleta_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM material_coletas
  WHERE material_coletas.id = material_coleta_items.coleta_id
  AND material_coletas.user_id = auth.uid()
));
