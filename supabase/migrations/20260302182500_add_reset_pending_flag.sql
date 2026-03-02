-- Migration to add password reset request tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reset_password_pending BOOLEAN DEFAULT false;

-- Index for faster filtering in admin panel
CREATE INDEX IF NOT EXISTS idx_reset_password_pending ON public.profiles(reset_password_pending) WHERE reset_password_pending = true;
