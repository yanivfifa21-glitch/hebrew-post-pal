
-- Step 1: Add new encrypted columns
ALTER TABLE public.user_credentials
ADD COLUMN IF NOT EXISTS encrypted_telegram_bot_token bytea,
ADD COLUMN IF NOT EXISTS encrypted_greenapi_api_token bytea,
ADD COLUMN IF NOT EXISTS encrypted_aliexpress_app_secret bytea,
ADD COLUMN IF NOT EXISTS encrypted_aliexpress_app_key bytea;

-- Step 2: Migrate existing plain text data to encrypted columns
UPDATE public.user_credentials
SET 
  encrypted_telegram_bot_token = CASE 
    WHEN telegram_bot_token IS NOT NULL AND telegram_bot_token != '' 
    THEN pgp_sym_encrypt(telegram_bot_token, 'lovable_secure_key_v1')
    ELSE NULL 
  END,
  encrypted_greenapi_api_token = CASE 
    WHEN greenapi_api_token IS NOT NULL AND greenapi_api_token != '' 
    THEN pgp_sym_encrypt(greenapi_api_token, 'lovable_secure_key_v1')
    ELSE NULL 
  END,
  encrypted_aliexpress_app_secret = CASE 
    WHEN aliexpress_app_secret IS NOT NULL AND aliexpress_app_secret != '' 
    THEN pgp_sym_encrypt(aliexpress_app_secret, 'lovable_secure_key_v1')
    ELSE NULL 
  END,
  encrypted_aliexpress_app_key = CASE 
    WHEN aliexpress_app_key IS NOT NULL AND aliexpress_app_key != '' 
    THEN pgp_sym_encrypt(aliexpress_app_key, 'lovable_secure_key_v1')
    ELSE NULL 
  END;

-- Step 3: Drop old plain text columns
ALTER TABLE public.user_credentials
DROP COLUMN IF EXISTS telegram_bot_token,
DROP COLUMN IF EXISTS greenapi_api_token,
DROP COLUMN IF EXISTS aliexpress_app_secret,
DROP COLUMN IF EXISTS aliexpress_app_key;

-- Step 4: Update the update_my_credentials function to encrypt data
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
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_credentials (
    user_id, 
    encrypted_telegram_bot_token, 
    telegram_chat_id,
    encrypted_greenapi_api_token, 
    greenapi_instance_id, 
    greenapi_chat_id,
    encrypted_aliexpress_app_secret, 
    encrypted_aliexpress_app_key
  )
  VALUES (
    auth.uid(), 
    CASE WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
         THEN pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1') ELSE NULL END,
    p_telegram_chat_id,
    CASE WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
         THEN pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1') ELSE NULL END,
    p_greenapi_instance_id,
    p_greenapi_chat_id,
    CASE WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
         THEN pgp_sym_encrypt(p_aliexpress_app_secret, 'lovable_secure_key_v1') ELSE NULL END,
    CASE WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
         THEN pgp_sym_encrypt(p_aliexpress_app_key, 'lovable_secure_key_v1') ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_telegram_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_telegram_bot_token 
    END,
    telegram_chat_id = CASE 
      WHEN p_telegram_chat_id IS NOT NULL AND p_telegram_chat_id != '' 
      THEN p_telegram_chat_id 
      ELSE user_credentials.telegram_chat_id 
    END,
    encrypted_greenapi_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_greenapi_api_token 
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
    encrypted_aliexpress_app_secret = CASE 
      WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
      THEN pgp_sym_encrypt(p_aliexpress_app_secret, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_aliexpress_app_secret 
    END,
    encrypted_aliexpress_app_key = CASE 
      WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
      THEN pgp_sym_encrypt(p_aliexpress_app_key, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_aliexpress_app_key 
    END,
    updated_at = now();
  
  RETURN json_build_object('success', true);
END;
$$;

-- Step 5: Update the get_my_credentials_status function
CREATE OR REPLACE FUNCTION public.get_my_credentials_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cred_record record;
BEGIN
  SELECT 
    encrypted_telegram_bot_token IS NOT NULL AS has_telegram_token,
    telegram_chat_id IS NOT NULL AND telegram_chat_id != '' AS has_telegram_chat_id,
    encrypted_greenapi_api_token IS NOT NULL AS has_greenapi_token,
    greenapi_instance_id IS NOT NULL AND greenapi_instance_id != '' AS has_greenapi_instance,
    greenapi_chat_id IS NOT NULL AND greenapi_chat_id != '' AS has_greenapi_chat_id,
    encrypted_aliexpress_app_secret IS NOT NULL AS has_aliexpress_secret,
    encrypted_aliexpress_app_key IS NOT NULL AS has_aliexpress_key
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

-- Step 6: Create a SECURITY DEFINER function for edge functions to get decrypted credentials
-- This function can only be called by service role (edge functions)
CREATE OR REPLACE FUNCTION public.get_decrypted_user_credentials(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cred_record record;
BEGIN
  -- This function should only be called by service role
  SELECT 
    CASE WHEN encrypted_telegram_bot_token IS NOT NULL 
         THEN pgp_sym_decrypt(encrypted_telegram_bot_token, 'lovable_secure_key_v1') 
         ELSE NULL END AS telegram_bot_token,
    telegram_chat_id,
    CASE WHEN encrypted_greenapi_api_token IS NOT NULL 
         THEN pgp_sym_decrypt(encrypted_greenapi_api_token, 'lovable_secure_key_v1') 
         ELSE NULL END AS greenapi_api_token,
    greenapi_instance_id,
    greenapi_chat_id,
    CASE WHEN encrypted_aliexpress_app_secret IS NOT NULL 
         THEN pgp_sym_decrypt(encrypted_aliexpress_app_secret, 'lovable_secure_key_v1') 
         ELSE NULL END AS aliexpress_app_secret,
    CASE WHEN encrypted_aliexpress_app_key IS NOT NULL 
         THEN pgp_sym_decrypt(encrypted_aliexpress_app_key, 'lovable_secure_key_v1') 
         ELSE NULL END AS aliexpress_app_key
  INTO cred_record
  FROM public.user_credentials
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No credentials found');
  END IF;
  
  RETURN row_to_json(cred_record);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', 'Decryption failed');
END;
$$;
