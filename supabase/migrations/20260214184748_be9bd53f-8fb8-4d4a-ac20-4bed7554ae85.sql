
-- Revoke ALL direct access from anon and authenticated roles on user_credentials
-- This ensures the table is only accessible via service_role (used by Edge Functions)
REVOKE ALL ON public.user_credentials FROM anon;
REVOKE ALL ON public.user_credentials FROM authenticated;

-- The existing RLS "No client access" policy remains as defense-in-depth
-- Service role bypasses RLS by design, so Edge Functions continue to work
