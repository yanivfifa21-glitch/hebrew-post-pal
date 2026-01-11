-- Fix encrypt_credential and decrypt_credential to explicitly reference extensions schema
-- This resolves the "function pgp_sym_encrypt(text, unknown) does not exist" error

CREATE OR REPLACE FUNCTION public.encrypt_credential(plain_text text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest(current_setting('request.jwt.claims', true)::text || 'lovable_secure_key', 'sha256'), 'hex');
  END IF;
  
  -- Explicitly reference extensions schema
  RETURN extensions.pgp_sym_encrypt(plain_text, encryption_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_credential(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest(current_setting('request.jwt.claims', true)::text || 'lovable_secure_key', 'sha256'), 'hex');
  END IF;
  
  -- Explicitly reference extensions schema
  RETURN extensions.pgp_sym_decrypt(encrypted_data, encryption_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- Also update update_my_credentials to reference extensions schema
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
AS $function$
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
         THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1') ELSE NULL END,
    p_telegram_chat_id,
    CASE WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
         THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1') ELSE NULL END,
    p_greenapi_instance_id,
    p_greenapi_chat_id,
    CASE WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
         THEN extensions.pgp_sym_encrypt(p_aliexpress_app_secret, 'lovable_secure_key_v1') ELSE NULL END,
    CASE WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
         THEN extensions.pgp_sym_encrypt(p_aliexpress_app_key, 'lovable_secure_key_v1') ELSE NULL END
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    encrypted_telegram_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1')
      ELSE EXCLUDED.encrypted_telegram_bot_token
    END,
    telegram_chat_id = COALESCE(p_telegram_chat_id, EXCLUDED.telegram_chat_id),
    encrypted_greenapi_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1')
      ELSE EXCLUDED.encrypted_greenapi_api_token
    END,
    greenapi_instance_id = COALESCE(p_greenapi_instance_id, EXCLUDED.greenapi_instance_id),
    greenapi_chat_id = COALESCE(p_greenapi_chat_id, EXCLUDED.greenapi_chat_id),
    encrypted_aliexpress_app_secret = CASE 
      WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_secret, 'lovable_secure_key_v1')
      ELSE EXCLUDED.encrypted_aliexpress_app_secret
    END,
    encrypted_aliexpress_app_key = CASE 
      WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_key, 'lovable_secure_key_v1')
      ELSE EXCLUDED.encrypted_aliexpress_app_key
    END,
    updated_at = now();
    
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;

-- Also update get_decrypted_user_credentials to reference extensions schema
CREATE OR REPLACE FUNCTION public.get_decrypted_user_credentials(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cred_record record;
BEGIN
  SELECT 
    CASE WHEN encrypted_telegram_bot_token IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_telegram_bot_token, 'lovable_secure_key_v1') 
         ELSE NULL END AS telegram_bot_token,
    telegram_chat_id,
    CASE WHEN encrypted_greenapi_api_token IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_greenapi_api_token, 'lovable_secure_key_v1') 
         ELSE NULL END AS greenapi_api_token,
    greenapi_instance_id,
    greenapi_chat_id,
    CASE WHEN encrypted_aliexpress_app_secret IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_aliexpress_app_secret, 'lovable_secure_key_v1') 
         ELSE NULL END AS aliexpress_app_secret,
    CASE WHEN encrypted_aliexpress_app_key IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_aliexpress_app_key, 'lovable_secure_key_v1') 
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
$function$;