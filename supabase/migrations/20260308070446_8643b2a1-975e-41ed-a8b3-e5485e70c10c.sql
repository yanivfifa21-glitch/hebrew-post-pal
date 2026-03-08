
-- 1. Fix automation_logs: restrict policies to 'authenticated' role only
DROP POLICY IF EXISTS "Users can insert own automation logs" ON public.automation_logs;
DROP POLICY IF EXISTS "Users can view own automation logs" ON public.automation_logs;
DROP POLICY IF EXISTS "No delete allowed" ON public.automation_logs;
DROP POLICY IF EXISTS "No update allowed" ON public.automation_logs;

CREATE POLICY "Users can insert own automation logs" ON public.automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own automation logs" ON public.automation_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "No delete allowed" ON public.automation_logs
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "No update allowed" ON public.automation_logs
  FOR UPDATE TO authenticated
  USING (false);

-- 2. Add explicit deny UPDATE policy for zone_accounts
CREATE POLICY "No update allowed" ON public.zone_accounts
  FOR UPDATE TO authenticated
  USING (false);

-- 3. Fix authorized_users INSERT policy to be more restrictive (authenticated only)
DROP POLICY IF EXISTS "User can request access for self" ON public.authorized_users;

CREATE POLICY "User can request access for self" ON public.authorized_users
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND email = lower((auth.jwt() ->> 'email'::text))
    AND NOT EXISTS (
      SELECT 1 FROM public.authorized_users au
      WHERE au.email = lower((auth.jwt() ->> 'email'::text))
    )
  );
