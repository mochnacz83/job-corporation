-- Reforça o gatilho handle_new_user para garantir que todos os campos sejam mapeados do metadata
-- Esta migração garante que chaves case-insensitive e COALESCE sejam usados para evitar campos nulos

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
  -- Extração robusta do metadata (tenta chaves com primeira letra maiúscula e minúscula)
  v_matricula := COALESCE(NEW.raw_user_meta_data->>'matricula', NEW.raw_user_meta_data->>'Matricula', '');
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'Nome', '');
  v_email := COALESCE(NEW.raw_user_meta_data->>'email_contato', NEW.raw_user_meta_data->>'email', '');
  v_empresa := COALESCE(NEW.raw_user_meta_data->>'empresa', NEW.raw_user_meta_data->>'Empresa', '');
  v_telefone := COALESCE(NEW.raw_user_meta_data->>'telefone', NEW.raw_user_meta_data->>'Telefone', '');
  v_cargo := COALESCE(NEW.raw_user_meta_data->>'cargo', NEW.raw_user_meta_data->>'Cargo', '');
  v_area := COALESCE(NEW.raw_user_meta_data->>'area', NEW.raw_user_meta_data->>'Area', '');

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
    'pendente' -- Garante que novos cadastros comecem como pendentes
  );
  RETURN NEW;
END;
$function$;
