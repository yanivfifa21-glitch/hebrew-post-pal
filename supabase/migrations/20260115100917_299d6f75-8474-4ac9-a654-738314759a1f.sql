-- Drop existing restrictive policies and recreate as permissive for authorized_users
DROP POLICY IF EXISTS "Admin can view users" ON public.authorized_users;
DROP POLICY IF EXISTS "Admin can delete users" ON public.authorized_users;
DROP POLICY IF EXISTS "Admin can update status" ON public.authorized_users;
DROP POLICY IF EXISTS "User can request access for self" ON public.authorized_users;

-- Recreate as permissive policies
CREATE POLICY "Admin can view users" 
ON public.authorized_users 
FOR SELECT 
TO authenticated
USING (is_admin());

CREATE POLICY "Admin can update status" 
ON public.authorized_users 
FOR UPDATE 
TO authenticated
USING (is_admin());

CREATE POLICY "Admin can delete users" 
ON public.authorized_users 
FOR DELETE 
TO authenticated
USING (is_admin());

CREATE POLICY "User can request access for self" 
ON public.authorized_users 
FOR INSERT 
TO authenticated
WITH CHECK ((status = 'pending') AND (email = lower((auth.jwt() ->> 'email'))));

-- Drop existing restrictive policies and recreate as permissive for app_settings
DROP POLICY IF EXISTS "Users can view own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON public.app_settings;

-- Recreate as permissive policies
CREATE POLICY "Users can view own settings" 
ON public.app_settings 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
ON public.app_settings 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
ON public.app_settings 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings" 
ON public.app_settings 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);