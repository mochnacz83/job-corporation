
DROP POLICY IF EXISTS "Users insert own justificativas" ON public.justificativas_10h;

CREATE POLICY "Users insert own justificativas"
ON public.justificativas_10h
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    created_by_user = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND UPPER(TRIM(p.matricula)) = UPPER(TRIM(justificativas_10h.matricula_tt))
    )
  )
);
