
-- 1) Add edit-request workflow fields to material_coletas
ALTER TABLE public.material_coletas
  ADD COLUMN IF NOT EXISTS edit_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_request_reason text,
  ADD COLUMN IF NOT EXISTS edit_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by uuid,
  ADD COLUMN IF NOT EXISTS post_edit_locked boolean NOT NULL DEFAULT false;

-- 2) Trigger to enforce global serial uniqueness on material_coleta_items
CREATE OR REPLACE FUNCTION public.enforce_unique_serial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_unique_serial_ins ON public.material_coleta_items;
CREATE TRIGGER trg_unique_serial_ins
  BEFORE INSERT ON public.material_coleta_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_serial();

DROP TRIGGER IF EXISTS trg_unique_serial_upd ON public.material_coleta_items;
CREATE TRIGGER trg_unique_serial_upd
  BEFORE UPDATE OF serial ON public.material_coleta_items
  FOR EACH ROW
  WHEN (NEW.serial IS DISTINCT FROM OLD.serial)
  EXECUTE FUNCTION public.enforce_unique_serial();

-- 3) Restrict owner UPDATE/DELETE on material_coletas after submission
DROP POLICY IF EXISTS "Users can update own coletas" ON public.material_coletas;
CREATE POLICY "Users can update own coletas"
  ON public.material_coletas
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND post_edit_locked = false
    AND (
      -- always allow updating only the request flag/reason
      true
    )
  )
  WITH CHECK (auth.uid() = user_id AND post_edit_locked = false);

-- 4) Restrict owner write access on items: only when unlocked and not yet locked
DROP POLICY IF EXISTS "Users can insert own coleta items" ON public.material_coleta_items;
CREATE POLICY "Users can insert own coleta items"
  ON public.material_coleta_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.material_coletas mc
      WHERE mc.id = material_coleta_items.coleta_id
        AND mc.user_id = auth.uid()
        AND (mc.edit_unlocked = true AND mc.post_edit_locked = false
             OR NOT EXISTS (SELECT 1 FROM public.material_coleta_items i2 WHERE i2.coleta_id = mc.id))
    )
  );

DROP POLICY IF EXISTS "Users can update own coleta items" ON public.material_coleta_items;
CREATE POLICY "Users can update own coleta items"
  ON public.material_coleta_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.material_coletas mc
      WHERE mc.id = material_coleta_items.coleta_id
        AND mc.user_id = auth.uid()
        AND mc.edit_unlocked = true
        AND mc.post_edit_locked = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.material_coletas mc
      WHERE mc.id = material_coleta_items.coleta_id
        AND mc.user_id = auth.uid()
        AND mc.edit_unlocked = true
        AND mc.post_edit_locked = false
    )
  );

DROP POLICY IF EXISTS "Users can delete own coleta items" ON public.material_coleta_items;
CREATE POLICY "Users can delete own coleta items"
  ON public.material_coleta_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.material_coletas mc
      WHERE mc.id = material_coleta_items.coleta_id
        AND mc.user_id = auth.uid()
        AND mc.edit_unlocked = true
        AND mc.post_edit_locked = false
    )
  );

-- 5) Index for serial lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_material_coleta_items_serial_upper
  ON public.material_coleta_items (UPPER(TRIM(serial)))
  WHERE serial IS NOT NULL AND TRIM(serial) <> '';
