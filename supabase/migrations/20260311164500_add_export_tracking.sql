-- Add last_exported_at column to material_coletas
ALTER TABLE public.material_coletas ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMPTZ DEFAULT NULL;

-- Add updated_at if not exists (checked migration 20260305192959, it exists)
-- This column will help in tracking changes and potentially for future aging logic if created_at is not enough.
