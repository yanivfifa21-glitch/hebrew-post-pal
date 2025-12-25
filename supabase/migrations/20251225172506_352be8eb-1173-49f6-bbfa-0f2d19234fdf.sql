-- Add automation_enabled column to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS automation_enabled boolean DEFAULT false;