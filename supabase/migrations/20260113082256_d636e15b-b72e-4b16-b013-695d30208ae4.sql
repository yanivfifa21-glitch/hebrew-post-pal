-- Add USD exchange rate to app_settings
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS usd_exchange_rate numeric DEFAULT 3.7;