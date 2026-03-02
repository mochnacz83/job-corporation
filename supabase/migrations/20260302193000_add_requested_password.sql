-- Migration to add requested_password column for admin validation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_password TEXT;

-- Update index to include requested_password for admin convenience (optional but helpful)
COMMENT ON COLUMN public.profiles.requested_password IS 'Stores the new password requested by the user, awaiting admin approval.';
