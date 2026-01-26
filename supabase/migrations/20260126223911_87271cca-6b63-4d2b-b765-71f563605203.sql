-- Ensure RLS is enabled and force it for table owner too
ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_users FORCE ROW LEVEL SECURITY;

-- Drop existing SELECT policy if exists and recreate it with explicit admin-only access
DROP POLICY IF EXISTS "Admin can view users" ON public.authorized_users;

-- Create explicit admin-only SELECT policy
CREATE POLICY "Only admins can view authorized users"
ON public.authorized_users
FOR SELECT
TO authenticated
USING (is_admin());

-- Also add explicit denial for anon role (unauthenticated users)
-- By not having any policy for 'anon', they are automatically denied
-- But let's be extra safe by ensuring no permissive policies exist