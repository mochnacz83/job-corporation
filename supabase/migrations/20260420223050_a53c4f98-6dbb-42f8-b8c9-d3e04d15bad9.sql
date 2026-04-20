CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    user_id, matricula, nome, email, empresa, telefone,
    area, cargo, must_change_password
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'matricula', ''),
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'email_contato', ''),
    COALESCE(NEW.raw_user_meta_data->>'empresa', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'reg_area', NEW.raw_user_meta_data->>'area', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'reg_cargo', NEW.raw_user_meta_data->>'cargo', ''), ''),
    true
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Backfill: corrigir profiles existentes onde area/cargo estão NULL mas existem nos metadata do auth
UPDATE public.profiles p
SET 
  area = COALESCE(p.area, NULLIF(u.raw_user_meta_data->>'reg_area', ''), NULLIF(u.raw_user_meta_data->>'area', '')),
  cargo = COALESCE(p.cargo, NULLIF(u.raw_user_meta_data->>'reg_cargo', ''), NULLIF(u.raw_user_meta_data->>'cargo', ''))
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.area IS NULL OR p.cargo IS NULL)
  AND (u.raw_user_meta_data->>'area' IS NOT NULL OR u.raw_user_meta_data->>'cargo' IS NOT NULL);