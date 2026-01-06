-- Step 1: Create server-side-only credentials table
CREATE TABLE public.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  telegram_bot_token text,
  telegram_chat_id text,
  greenapi_api_token text,
  greenapi_instance_id text,
  greenapi_chat_id text,
  aliexpress_app_secret text,
  aliexpress_app_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS with NO client access policies
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- No SELECT policy - only server (service role) can read
-- This ensures credentials never reach the client
CREATE POLICY "No client access"
ON public.user_credentials FOR ALL
USING (false)
WITH CHECK (false);

-- Step 2: Create secure RPC function for updating credentials (write-only from client)
CREATE OR REPLACE FUNCTION public.update_my_credentials(
  p_telegram_bot_token text DEFAULT NULL,
  p_telegram_chat_id text DEFAULT NULL,
  p_greenapi_api_token text DEFAULT NULL,
  p_greenapi_instance_id text DEFAULT NULL,
  p_greenapi_chat_id text DEFAULT NULL,
  p_aliexpress_app_secret text DEFAULT NULL,
  p_aliexpress_app_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credentials (
    user_id, telegram_bot_token, telegram_chat_id,
    greenapi_api_token, greenapi_instance_id, greenapi_chat_id,
    aliexpress_app_secret, aliexpress_app_key
  )
  VALUES (
    auth.uid(), p_telegram_bot_token, p_telegram_chat_id,
    p_greenapi_api_token, p_greenapi_instance_id, p_greenapi_chat_id,
    p_aliexpress_app_secret, p_aliexpress_app_key
  )
  ON CONFLICT (user_id) DO UPDATE SET
    telegram_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN p_telegram_bot_token 
      ELSE user_credentials.telegram_bot_token 
    END,
    telegram_chat_id = CASE 
      WHEN p_telegram_chat_id IS NOT NULL AND p_telegram_chat_id != '' 
      THEN p_telegram_chat_id 
      ELSE user_credentials.telegram_chat_id 
    END,
    greenapi_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN p_greenapi_api_token 
      ELSE user_credentials.greenapi_api_token 
    END,
    greenapi_instance_id = CASE 
      WHEN p_greenapi_instance_id IS NOT NULL AND p_greenapi_instance_id != '' 
      THEN p_greenapi_instance_id 
      ELSE user_credentials.greenapi_instance_id 
    END,
    greenapi_chat_id = CASE 
      WHEN p_greenapi_chat_id IS NOT NULL AND p_greenapi_chat_id != '' 
      THEN p_greenapi_chat_id 
      ELSE user_credentials.greenapi_chat_id 
    END,
    aliexpress_app_secret = CASE 
      WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
      THEN p_aliexpress_app_secret 
      ELSE user_credentials.aliexpress_app_secret 
    END,
    aliexpress_app_key = CASE 
      WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
      THEN p_aliexpress_app_key 
      ELSE user_credentials.aliexpress_app_key 
    END,
    updated_at = now();
  
  RETURN json_build_object('success', true);
END;
$$;

-- Step 3: Create RPC to check if credentials are configured (returns boolean, not values)
CREATE OR REPLACE FUNCTION public.get_my_credentials_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cred_record record;
BEGIN
  SELECT 
    telegram_bot_token IS NOT NULL AND telegram_bot_token != '' AS has_telegram_token,
    telegram_chat_id IS NOT NULL AND telegram_chat_id != '' AS has_telegram_chat_id,
    greenapi_api_token IS NOT NULL AND greenapi_api_token != '' AS has_greenapi_token,
    greenapi_instance_id IS NOT NULL AND greenapi_instance_id != '' AS has_greenapi_instance,
    greenapi_chat_id IS NOT NULL AND greenapi_chat_id != '' AS has_greenapi_chat_id,
    aliexpress_app_secret IS NOT NULL AND aliexpress_app_secret != '' AS has_aliexpress_secret,
    aliexpress_app_key IS NOT NULL AND aliexpress_app_key != '' AS has_aliexpress_key
  INTO cred_record
  FROM public.user_credentials
  WHERE user_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'has_telegram_token', false,
      'has_telegram_chat_id', false,
      'has_greenapi_token', false,
      'has_greenapi_instance', false,
      'has_greenapi_chat_id', false,
      'has_aliexpress_secret', false,
      'has_aliexpress_key', false
    );
  END IF;
  
  RETURN row_to_json(cred_record);
END;
$$;

-- Step 4: Migrate existing data from app_settings to user_credentials
INSERT INTO public.user_credentials (
  user_id, telegram_bot_token, telegram_chat_id,
  greenapi_api_token, greenapi_instance_id, greenapi_chat_id,
  aliexpress_app_secret, aliexpress_app_key
)
SELECT 
  user_id, telegram_bot_token, telegram_chat_id,
  greenapi_api_token, greenapi_instance_id, greenapi_chat_id,
  aliexpress_app_secret, aliexpress_app_key
FROM public.app_settings
WHERE user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Step 5: Drop sensitive columns from app_settings (keeping non-sensitive settings)
ALTER TABLE public.app_settings 
DROP COLUMN IF EXISTS telegram_bot_token,
DROP COLUMN IF EXISTS greenapi_api_token,
DROP COLUMN IF EXISTS greenapi_instance_id,
DROP COLUMN IF EXISTS greenapi_chat_id,
DROP COLUMN IF EXISTS aliexpress_app_secret,
DROP COLUMN IF EXISTS aliexpress_app_key;

-- Step 6: Remove sensitive columns from messaging_accounts (keep structure for account names)
ALTER TABLE public.messaging_accounts 
DROP COLUMN IF EXISTS telegram_bot_token,
DROP COLUMN IF EXISTS greenapi_api_token,
DROP COLUMN IF EXISTS greenapi_instance_id,
DROP COLUMN IF EXISTS greenapi_chat_id;

-- Add trigger for updated_at on user_credentials
CREATE TRIGGER update_user_credentials_updated_at
BEFORE UPDATE ON public.user_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();