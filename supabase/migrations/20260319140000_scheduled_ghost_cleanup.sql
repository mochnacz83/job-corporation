-- Clean up users from auth.users that do not have a corresponding entry in public.profiles
-- This resolves "ghost users" that block new registrations with the same email or matricula

DELETE FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.profiles);

-- Also clean up any potential orphaned metadata in registration_debug if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'registration_debug') THEN
        DELETE FROM public.registration_debug r
        WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.user_id);
    END IF;
END $$;
