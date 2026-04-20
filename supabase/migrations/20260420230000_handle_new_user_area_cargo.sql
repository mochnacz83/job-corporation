-- Update handle_new_user trigger to include area and cargo from signup metadata.
-- Previously these fields were null until the complete-signup edge function ran,
-- but that function was unauthorized (no session for unconfirmed users), leaving
-- area/cargo permanently empty.
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
