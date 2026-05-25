
-- 1. Storage: material-fotos INSERT policy must verify user owns the path
DROP POLICY IF EXISTS "Authenticated users can upload material photos" ON storage.objects;
CREATE POLICY "Users can upload own material photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'material-fotos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. reagenda_history: prevent users from changing user_id on update
DROP POLICY IF EXISTS "Users can update own reagenda history" ON public.reagenda_history;
CREATE POLICY "Users can update own reagenda history"
ON public.reagenda_history
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
-- Trigger to lock user_id field on update
CREATE OR REPLACE FUNCTION public.prevent_reagenda_history_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o user_id do registro';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_reagenda_history_lock_user_id ON public.reagenda_history;
CREATE TRIGGER trg_reagenda_history_lock_user_id
BEFORE UPDATE ON public.reagenda_history
FOR EACH ROW
EXECUTE FUNCTION public.prevent_reagenda_history_user_id_change();
