-- Add interval posting time range columns to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS interval_start_time TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS interval_end_time TEXT DEFAULT '22:00';