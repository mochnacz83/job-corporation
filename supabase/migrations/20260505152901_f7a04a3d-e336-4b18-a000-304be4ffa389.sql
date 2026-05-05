DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_sync_log';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
ALTER TABLE public.atividades_sync_log REPLICA IDENTITY FULL;