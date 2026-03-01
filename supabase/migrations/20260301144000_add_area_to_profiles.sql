-- Add area column and update handle_new_user function
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS area TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, matricula, nome, email, empresa, telefone, cargo, area, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'matricula', ''),
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'email_contato', ''),
    COALESCE(NEW.raw_user_meta_data->>'empresa', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cargo', ''),
    COALESCE(NEW.raw_user_meta_data->>'area', ''),
    true
  );
  RETURN NEW;
END;
$function$;
