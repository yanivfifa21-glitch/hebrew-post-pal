-- Add user-specific credential columns to app_settings table
ALTER TABLE public.app_settings
ADD COLUMN aliexpress_app_key text,
ADD COLUMN aliexpress_app_secret text,
ADD COLUMN aliexpress_tracking_id text DEFAULT 'TELEGRAM',
ADD COLUMN telegram_bot_token text,
ADD COLUMN telegram_chat_id text,
ADD COLUMN greenapi_instance_id text,
ADD COLUMN greenapi_api_token text,
ADD COLUMN greenapi_chat_id text,
ADD COLUMN custom_ai_prompt text;

-- Add comment for documentation
COMMENT ON COLUMN public.app_settings.custom_ai_prompt IS 'User-defined system prompt for Hebrew post generation';