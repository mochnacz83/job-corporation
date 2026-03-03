-- Migração para limpeza de dados órfãos e configuração de ON DELETE CASCADE
-- Garante que ao excluir um usuário, todo o seu histórico (logs, visitas, presença) seja removido.

-- 1. Limpeza de Dados Órfãos (Faxina inicial)
DELETE FROM public.user_roles WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.profiles WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.access_logs WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.user_presence WHERE user_id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.visitas WHERE supervisor_id NOT IN (SELECT id FROM auth.users);

-- 2. Configuração de Foreign Keys com CASCADE

-- access_logs
ALTER TABLE public.access_logs 
  DROP CONSTRAINT IF EXISTS access_logs_user_id_fkey,
  ADD CONSTRAINT access_logs_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_presence
ALTER TABLE public.user_presence 
  DROP CONSTRAINT IF EXISTS user_presence_user_id_fkey,
  ADD CONSTRAINT user_presence_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- visitas
ALTER TABLE public.visitas 
  DROP CONSTRAINT IF EXISTS visitas_supervisor_id_fkey,
  ADD CONSTRAINT visitas_supervisor_id_fkey 
  FOREIGN KEY (supervisor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- profiles
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_user_id_fkey,
  ADD CONSTRAINT profiles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_roles
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
  ADD CONSTRAINT user_roles_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
