
CREATE OR REPLACE FUNCTION public.enforce_unique_serial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  norm text;
  exists_id uuid;
BEGIN
  IF NEW.serial IS NULL THEN
    RETURN NEW;
  END IF;
  norm := UPPER(TRIM(NEW.serial));
  IF norm = '' OR norm = 'N/A' OR norm = '-' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO exists_id
  FROM public.material_coleta_items
  WHERE UPPER(TRIM(serial)) = norm
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF exists_id IS NOT NULL THEN
    RAISE EXCEPTION 'Serial duplicado: % já está cadastrado em outra coleta.', NEW.serial
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$function$;
