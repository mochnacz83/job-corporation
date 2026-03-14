-- Adiciona coluna deleted_by_user para Soft Delete
ALTER TABLE public.reagenda_history ADD COLUMN IF NOT EXISTS deleted_by_user boolean DEFAULT false;

-- Remove políticas antigas para recriar com suporte a Admin e Soft Delete
DROP POLICY IF EXISTS "Users can view their own reagenda history" ON public.reagenda_history;
DROP POLICY IF EXISTS "Users can insert their own reagenda history" ON public.reagenda_history;
DROP POLICY IF EXISTS "Users can update their own reagenda history" ON public.reagenda_history;
DROP POLICY IF EXISTS "Users can delete their own reagenda history" ON public.reagenda_history;

-- Nova política: Usuários veem seus próprios registros não excluídos; Admins veem tudo
CREATE POLICY "Enable access for owners and admins"
ON public.reagenda_history FOR SELECT
USING (
  (auth.uid() = user_id AND deleted_by_user = false) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

-- Nova política: Usuários inserem seus próprios registros
CREATE POLICY "Enable insert for authenticated users"
ON public.reagenda_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Nova política: Usuários atualizam seus próprios registros; Admins atualizam tudo
CREATE POLICY "Enable update for owners and admins"
ON public.reagenda_history FOR UPDATE
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
)
WITH CHECK (
  (auth.uid() = user_id) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

-- Nova política: Apenas Admins podem DELETAR fisicamente; Usuários usam Soft Delete (Update)
CREATE POLICY "Enable delete for admins only"
ON public.reagenda_history FOR DELETE
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Notificação de conclusão da migração
COMMENT ON TABLE public.reagenda_history IS 'Histórico de reagendamento com suporte a isolamento por usuário e auditoria administrativa.';
