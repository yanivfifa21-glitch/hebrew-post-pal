-- Add column for custom AI rewrite template (Telegram style)
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS ai_rewrite_template text;

-- Add a comment explaining the column
COMMENT ON COLUMN public.app_settings.ai_rewrite_template IS 'Custom template for AI Rewrite mode - Telegram-style Hebrew content';