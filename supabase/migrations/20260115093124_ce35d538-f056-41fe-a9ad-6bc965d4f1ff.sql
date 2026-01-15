-- 1. Add posting_interval_minutes column (supports 30, 60, 90, etc.)
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS posting_interval_minutes INTEGER DEFAULT NULL;

-- 2. Migrate existing posting_interval_hours to minutes
UPDATE public.app_settings 
SET posting_interval_minutes = posting_interval_hours * 60
WHERE posting_interval_hours IS NOT NULL AND posting_interval_minutes IS NULL;

-- 3. Remove duplicate RLS policy on authorized_users (keep only the authenticated role one)
DROP POLICY IF EXISTS "Only admins can view authorized users" ON public.authorized_users;