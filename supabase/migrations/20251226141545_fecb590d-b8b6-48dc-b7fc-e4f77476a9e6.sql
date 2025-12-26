-- Add publishing_days column to app_settings
-- Days are stored as integers: 0=Sunday, 1=Monday, ... 6=Saturday
-- Default to all days enabled
ALTER TABLE public.app_settings 
ADD COLUMN publishing_days integer[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6];