-- Add separate interval settings for WhatsApp and Telegram
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS whatsapp_interval_minutes integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS telegram_interval_minutes integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS whatsapp_interval_start_time text DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS whatsapp_interval_end_time text DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS telegram_interval_start_time text DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS telegram_interval_end_time text DEFAULT '22:00';

-- Add comment for documentation
COMMENT ON COLUMN public.app_settings.whatsapp_interval_minutes IS 'Separate posting interval in minutes for WhatsApp channel';
COMMENT ON COLUMN public.app_settings.telegram_interval_minutes IS 'Separate posting interval in minutes for Telegram channel';
COMMENT ON COLUMN public.app_settings.whatsapp_interval_start_time IS 'Start time for WhatsApp interval posting';
COMMENT ON COLUMN public.app_settings.whatsapp_interval_end_time IS 'End time for WhatsApp interval posting';
COMMENT ON COLUMN public.app_settings.telegram_interval_start_time IS 'Start time for Telegram interval posting';
COMMENT ON COLUMN public.app_settings.telegram_interval_end_time IS 'End time for Telegram interval posting';