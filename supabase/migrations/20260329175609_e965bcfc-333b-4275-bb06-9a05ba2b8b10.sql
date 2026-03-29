ALTER TABLE public.earnings_notification_settings 
ADD COLUMN IF NOT EXISTS report_hour integer NOT NULL DEFAULT 9,
ADD COLUMN IF NOT EXISTS bot_account_id uuid NULL;