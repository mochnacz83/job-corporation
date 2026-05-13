
-- Add support for dual-serial in REPARO + APLICAR/BAIXAR (Aplicado + Retirado)
ALTER TABLE public.material_coleta_items
  ADD COLUMN IF NOT EXISTS serial_retirado text;

ALTER TABLE public.material_coletas
  ADD COLUMN IF NOT EXISTS linked_aplicacao_id uuid;

CREATE INDEX IF NOT EXISTS idx_material_coletas_linked_aplicacao_id
  ON public.material_coletas(linked_aplicacao_id);

-- Update unique-serial trigger to also enforce uniqueness on serial_retirado
CREATE OR REPLACE FUNCTION public.enforce_unique_serial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  norm text;
  exists_id uuid;
  norm_ret text;
BEGIN
  -- Validate serial (applied)
  IF NEW.serial IS NOT NULL THEN
    norm := UPPER(TRIM(NEW.serial));
    IF norm <> '' AND norm <> 'N/A' AND norm <> '-' THEN
      SELECT id INTO exists_id
      FROM public.material_coleta_items
      WHERE (UPPER(TRIM(serial)) = norm OR UPPER(TRIM(COALESCE(serial_retirado,''))) = norm)
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      LIMIT 1;

      IF exists_id IS NOT NULL THEN
        RAISE EXCEPTION 'Serial duplicado: % já está cadastrado em outra coleta.', NEW.serial
          USING ERRCODE = 'unique_violation';
      END IF;

      -- Cannot equal serial_retirado of same row
      IF NEW.serial_retirado IS NOT NULL AND UPPER(TRIM(NEW.serial_retirado)) = norm THEN
        RAISE EXCEPTION 'Serial Aplicado e Serial Retirado não podem ser iguais (%).', NEW.serial
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;

  -- Validate serial_retirado
  IF NEW.serial_retirado IS NOT NULL THEN
    norm_ret := UPPER(TRIM(NEW.serial_retirado));
    IF norm_ret <> '' AND norm_ret <> 'N/A' AND norm_ret <> '-' THEN
      SELECT id INTO exists_id
      FROM public.material_coleta_items
      WHERE (UPPER(TRIM(COALESCE(serial,''))) = norm_ret OR UPPER(TRIM(COALESCE(serial_retirado,''))) = norm_ret)
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      LIMIT 1;

      IF exists_id IS NOT NULL THEN
        RAISE EXCEPTION 'Serial Retirado duplicado: % já está cadastrado em outra coleta.', NEW.serial_retirado
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Make sure the trigger is wired
DROP TRIGGER IF EXISTS trg_enforce_unique_serial ON public.material_coleta_items;
CREATE TRIGGER trg_enforce_unique_serial
  BEFORE INSERT OR UPDATE ON public.material_coleta_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_serial();
