-- MIGRATION: CONSOLIDATED REGISTRATION FIX
-- Esta migration limpa qualquer versão anterior do gatilho e garante a captura de Cargo e Área.

-- 1. Garante colunas na tabela profiles
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cargo') THEN
        ALTER TABLE public.profiles ADD COLUMN cargo TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'area') THEN
        ALTER TABLE public.profiles ADD COLUMN area TEXT;
    END IF;
END $$;

-- 2. Limpeza total de triggers/functions anteriores para evitar conflitos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3. Criação da função ultra-robusta com suporte a múltiplas chaves e logs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matricula text;
  v_nome text;
  v_email text;
  v_empresa text;
  v_telefone text;
  v_cargo text;
  v_area text;
BEGIN
  -- Tenta extrair com prioridade para chaves em minúsculo (padrão frontend)
  v_matricula := COALESCE(NEW.raw_user_meta_data->>'matricula', NEW.raw_user_meta_data->>'Matricula', '');
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'Nome', '');
  v_email := COALESCE(NEW.raw_user_meta_data->>'email_contato', NEW.raw_user_meta_data->>'email', '');
  v_empresa := COALESCE(NEW.raw_user_meta_data->>'empresa', NEW.raw_user_meta_data->>'Empresa', '');
  v_telefone := COALESCE(NEW.raw_user_meta_data->>'telefone', NEW.raw_user_meta_data->>'Telefone', '');
  v_cargo := COALESCE(NEW.raw_user_meta_data->>'cargo', NEW.raw_user_meta_data->>'Cargo', '');
  v_area := COALESCE(NEW.raw_user_meta_data->>'area', NEW.raw_user_meta_data->>'Area', '');

  -- Log de aviso para depuração (visível nos logs do Supabase)
  IF v_cargo = '' OR v_area = '' THEN
    RAISE WARNING 'Cadastro sem Cargo ou Area detectado para o usuario %: meta=%', NEW.id, NEW.raw_user_meta_data;
  END IF;

  INSERT INTO public.profiles (
    user_id, 
    matricula, 
    nome, 
    email, 
    empresa, 
    telefone, 
    cargo, 
    area, 
    must_change_password,
    status
  )
  VALUES (
    NEW.id,
    v_matricula,
    v_nome,
    v_email,
    v_empresa,
    v_telefone,
    v_cargo,
    v_area,
    true,
    'pendente'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    matricula = EXCLUDED.matricula,
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    empresa = EXCLUDED.empresa,
    telefone = EXCLUDED.telefone,
    cargo = EXCLUDED.cargo,
    area = EXCLUDED.area,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro no handle_new_user: %', SQLERRM;
  RETURN NEW; -- Retorna NEW para não travar o cadastro no Auth
END;
$function$;

-- 4. Re-instalação do gatilho
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
