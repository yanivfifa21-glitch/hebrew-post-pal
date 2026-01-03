-- Fix authorized_users policy to only return boolean, not expose actual emails
DROP POLICY IF EXISTS "Anyone can check if email is authorized" ON public.authorized_users;

-- Create a secure function to check authorization status
CREATE OR REPLACE FUNCTION public.is_email_authorized(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE email = lower(check_email) AND status = 'active'
  );
$$;

-- Add interval posting settings columns to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS posting_interval_hours integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shabbat_mode_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS shabbat_start_time text DEFAULT '14:00',
ADD COLUMN IF NOT EXISTS shabbat_end_time text DEFAULT '20:00';

COMMENT ON COLUMN public.app_settings.posting_interval_hours IS 'Post every X hours instead of fixed times';
COMMENT ON COLUMN public.app_settings.shabbat_mode_enabled IS 'Disable posting on Shabbat';
COMMENT ON COLUMN public.app_settings.shabbat_start_time IS 'Friday time when Shabbat mode starts';
COMMENT ON COLUMN public.app_settings.shabbat_end_time IS 'Saturday time when Shabbat mode ends';