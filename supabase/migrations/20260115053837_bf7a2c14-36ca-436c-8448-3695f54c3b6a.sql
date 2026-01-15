-- Ensure RLS is enabled on user_credentials
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (prevents bypassing)
ALTER TABLE public.user_credentials FORCE ROW LEVEL SECURITY;