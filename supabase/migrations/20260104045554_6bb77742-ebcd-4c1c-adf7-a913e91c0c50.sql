-- Secure, non-enumerable access checks for invite-only auth

-- 1) Helper: return the logged-in user's email from JWT
-- (auth.jwt() is available in Postgres on Supabase)

-- 2) Return current user's access status without exposing the table
CREATE OR REPLACE FUNCTION public.get_my_access_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.status
  FROM public.authorized_users au
  WHERE au.email = lower((auth.jwt() ->> 'email'))
  LIMIT 1
$$;

-- 3) Boolean: is current user authorized?
CREATE OR REPLACE FUNCTION public.is_me_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.authorized_users au
    WHERE au.email = lower((auth.jwt() ->> 'email'))
      AND au.status IN ('active','approved')
  )
$$;

-- 4) Tighten RLS on authorized_users
ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

-- Remove any overly-broad policies (names may or may not exist)
DROP POLICY IF EXISTS "Anyone can check if email is authorized" ON public.authorized_users;
DROP POLICY IF EXISTS "Anyone can insert pending request" ON public.authorized_users;
DROP POLICY IF EXISTS "Admin can view users" ON public.authorized_users;
DROP POLICY IF EXISTS "Admins can view users" ON public.authorized_users;
DROP POLICY IF EXISTS "Admin can select users" ON public.authorized_users;

-- Admin can view all access requests/users
CREATE POLICY "Admin can view users"
ON public.authorized_users
FOR SELECT
TO authenticated
USING (public.is_admin());

-- User can request access ONLY for themselves (prevents email probing/spam)
CREATE POLICY "User can request access for self"
ON public.authorized_users
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pending'
  AND email = lower((auth.jwt() ->> 'email'))
);
