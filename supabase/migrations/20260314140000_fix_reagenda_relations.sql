-- Corrige relacionamentos e políticas para o módulo de Reagendamento

-- 1. Garante que user_id em reagenda_history mapeie para o perfil
-- Primeiro, vamos garantir que a coluna seja do tipo correto e tenha a FK
ALTER TABLE public.reagenda_history 
DROP CONSTRAINT IF EXISTS reagenda_history_user_id_fkey,
ADD CONSTRAINT reagenda_history_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Atualiza políticas de profiles para permitir que Admins vejam nomes de outros usuários
-- Isso é necessário para o join "profiles(nome)" na visão global admin
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (
  (auth.uid() = user_id) OR 
  (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
);

-- 3. Adiciona índice para performance no join
CREATE INDEX IF NOT EXISTS idx_reagenda_history_user_id ON public.reagenda_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

COMMENT ON CONSTRAINT reagenda_history_user_id_fkey ON public.reagenda_history IS 'Relacionamento com a tabela de perfis para garantir integridade e possibilitar joins de interface.';
