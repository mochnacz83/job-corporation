-- Create a debug table to capture what's actually coming from Auth
CREATE TABLE IF NOT EXISTS public.registration_debug (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    raw_metadata JSONB,
    captured_at TIMESTAMPTZ DEFAULT now()
);

-- Ultra-permissive RLS for debug (admins only to be safe)
ALTER TABLE public.registration_debug ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view debug logs" ON public.registration_debug FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user to be even more aggressive and log everything
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
  -- 1. Log the RAW data immediately to the debug table
  INSERT INTO public.registration_debug (user_id, raw_metadata)
  VALUES (NEW.id, NEW.raw_user_meta_data);

  -- 2. Extract values with extreme case-insensitivity
  v_matricula := COALESCE(NEW.raw_user_meta_data->>'matricula', NEW.raw_user_meta_data->>'Matricula', NEW.raw_user_meta_data->>'MATRICULA', '');
  v_nome       := COALESCE(NEW.raw_user_meta_data->>'nome',      NEW.raw_user_meta_data->>'Nome',      NEW.raw_user_meta_data->>'NOME',      '');
  v_email      := COALESCE(NEW.raw_user_meta_data->>'email_contato', NEW.raw_user_meta_data->>'email', NEW.raw_user_meta_data->>'Email',      '');
  v_empresa    := COALESCE(NEW.raw_user_meta_data->>'empresa',   NEW.raw_user_meta_data->>'Empresa',   NEW.raw_user_meta_data->>'EMPRESA',   '');
  v_telefone   := COALESCE(NEW.raw_user_meta_data->>'telefone',  NEW.raw_user_meta_data->>'Telefone',  NEW.raw_user_meta_data->>'TELEFONE',  '');
  v_cargo      := COALESCE(NEW.raw_user_meta_data->>'reg_cargo', NEW.raw_user_meta_data->>'cargo',    NEW.raw_user_meta_data->>'Cargo',     NEW.raw_user_meta_data->>'CARGO',     '');
  v_area       := COALESCE(NEW.raw_user_meta_data->>'reg_area',  NEW.raw_user_meta_data->>'area',     NEW.raw_user_meta_data->>'Area',      NEW.raw_user_meta_data->>'AREA',      '');

  -- 3. Upsert into profiles
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
  -- Fallback to basic record if everything fails, to avoid blocking signup
  INSERT INTO public.registration_debug (user_id, raw_metadata) VALUES (NEW.id, jsonb_build_object('error', SQLERRM));
  RETURN NEW;
END;
$function$;
