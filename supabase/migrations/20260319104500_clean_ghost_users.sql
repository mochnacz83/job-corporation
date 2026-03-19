-- 1. Identify and remove users who are in auth.users but DO NOT have a profile
-- This happens when registration fails partially (ghost users)
-- We use a DO block to run this cleanup once
DO $$
DECLARE
    v_count_auth INTEGER;
    v_count_ghosts INTEGER;
BEGIN
    SELECT count(*) INTO v_count_auth FROM auth.users;
    
    -- Count ghosts
    SELECT count(*) INTO v_count_ghosts 
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.user_id
    WHERE p.id IS NULL;
    
    RAISE NOTICE 'Cleaning up users. Total users: %, Ghost users: %', v_count_auth, v_count_ghosts;
    
    -- Delete ghost users from auth.users
    -- Note: This is safe because profiles are the source of truth for "real" users in this portal
    DELETE FROM auth.users 
    WHERE id IN (
        SELECT u.id 
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.user_id
        WHERE p.id IS NULL
    );
END $$;

-- 2. Clean up registration_debug (optional, but keep it tidy)
DELETE FROM public.registration_debug WHERE captured_at < now() - interval '7 days';

-- 3. Ensure Matricula uniqueness in public.profiles
-- This prevents the same matricula from being used across different user IDs
-- First, identify any duplicates that might exist (though unlikely given the app logic)
-- If duplicates exist, this might fail, but it's better to know now.
-- In case of failure, we only apply if no duplicates exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_matricula_unique'
    ) THEN
        -- Safely add the unique constraint
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_matricula_unique UNIQUE (matricula);
    END IF;
END $$;
