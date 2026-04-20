-- Permitir leitura compartilhada das coletas (somente leitura) para todos os autenticados
DROP POLICY IF EXISTS "Authenticated can view all coletas" ON public.material_coletas;
CREATE POLICY "Authenticated can view all coletas"
  ON public.material_coletas
  FOR SELECT
  TO authenticated
  USING (true);

-- Permitir leitura compartilhada dos itens das coletas para todos os autenticados
DROP POLICY IF EXISTS "Authenticated can view all coleta items" ON public.material_coleta_items;
CREATE POLICY "Authenticated can view all coleta items"
  ON public.material_coleta_items
  FOR SELECT
  TO authenticated
  USING (true);
