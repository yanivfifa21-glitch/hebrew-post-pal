
CREATE OR REPLACE FUNCTION public.update_my_credentials(
  p_telegram_bot_token text DEFAULT NULL::text,
  p_telegram_chat_id text DEFAULT NULL::text,
  p_greenapi_api_token text DEFAULT NULL::text,
  p_greenapi_instance_id text DEFAULT NULL::text,
  p_greenapi_chat_id text DEFAULT NULL::text,
  p_aliexpress_app_secret text DEFAULT NULL::text,
  p_aliexpress_app_key text DEFAULT NULL::text
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
      ELSE user_credentials.encrypted_telegram_bot_token
    END,
    telegram_chat_id = COALESCE(NULLIF(p_telegram_chat_id, ''), user_credentials.telegram_chat_id),
    encrypted_greenapi_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_greenapi_api_token
    END,
    greenapi_instance_id = COALESCE(NULLIF(p_greenapi_instance_id, ''), user_credentials.greenapi_instance_id),
    greenapi_chat_id = COALESCE(NULLIF(p_greenapi_chat_id, ''), user_credentials.greenapi_chat_id),
    encrypted_aliexpress_app_secret = CASE 
      WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_secret, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_aliexpress_app_secret
    END,
    encrypted_aliexpress_app_key = CASE 
      WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_key, 'lovable_secure_key_v1')
      ELSE user_credentials.encrypted_aliexpress_app_key
    END,
    updated_at = now();
    
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;
