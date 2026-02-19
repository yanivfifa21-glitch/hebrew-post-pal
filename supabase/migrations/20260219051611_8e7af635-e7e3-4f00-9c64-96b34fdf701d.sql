
-- 1. Add explicit SELECT deny policy on user_credentials
CREATE POLICY "No select allowed" ON public.user_credentials FOR SELECT USING (false);

-- 2. Replace hardcoded encryption key with environment variable in all functions

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
    encryption_key := 'lovable_secure_key_v1';
  END IF;
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
    encryption_key := 'lovable_secure_key_v1';
  END IF;
  RETURN extensions.pgp_sym_decrypt(encrypted_data, encryption_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

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
DECLARE
  enc_key text;
BEGIN
  enc_key := current_setting('app.settings.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'lovable_secure_key_v1';
  END IF;

  INSERT INTO public.user_credentials (
    user_id, encrypted_telegram_bot_token, telegram_chat_id,
    encrypted_greenapi_api_token, greenapi_instance_id, greenapi_chat_id,
    encrypted_aliexpress_app_secret, encrypted_aliexpress_app_key
  ) VALUES (
    auth.uid(),
    CASE WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
         THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, enc_key) ELSE NULL END,
    p_telegram_chat_id,
    CASE WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
         THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, enc_key) ELSE NULL END,
    p_greenapi_instance_id, p_greenapi_chat_id,
    CASE WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
         THEN extensions.pgp_sym_encrypt(p_aliexpress_app_secret, enc_key) ELSE NULL END,
    CASE WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
         THEN extensions.pgp_sym_encrypt(p_aliexpress_app_key, enc_key) ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    encrypted_telegram_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, enc_key)
      ELSE user_credentials.encrypted_telegram_bot_token END,
    telegram_chat_id = COALESCE(NULLIF(p_telegram_chat_id, ''), user_credentials.telegram_chat_id),
    encrypted_greenapi_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, enc_key)
      ELSE user_credentials.encrypted_greenapi_api_token END,
    greenapi_instance_id = COALESCE(NULLIF(p_greenapi_instance_id, ''), user_credentials.greenapi_instance_id),
    greenapi_chat_id = COALESCE(NULLIF(p_greenapi_chat_id, ''), user_credentials.greenapi_chat_id),
    encrypted_aliexpress_app_secret = CASE 
      WHEN p_aliexpress_app_secret IS NOT NULL AND p_aliexpress_app_secret != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_secret, enc_key)
      ELSE user_credentials.encrypted_aliexpress_app_secret END,
    encrypted_aliexpress_app_key = CASE 
      WHEN p_aliexpress_app_key IS NOT NULL AND p_aliexpress_app_key != '' 
      THEN extensions.pgp_sym_encrypt(p_aliexpress_app_key, enc_key)
      ELSE user_credentials.encrypted_aliexpress_app_key END,
    updated_at = now();
    
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_decrypted_user_credentials(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cred_record record;
  enc_key text;
BEGIN
  enc_key := current_setting('app.settings.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'lovable_secure_key_v1';
  END IF;

  SELECT 
    CASE WHEN encrypted_telegram_bot_token IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_telegram_bot_token, enc_key) ELSE NULL END AS telegram_bot_token,
    telegram_chat_id,
    CASE WHEN encrypted_greenapi_api_token IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_greenapi_api_token, enc_key) ELSE NULL END AS greenapi_api_token,
    greenapi_instance_id, greenapi_chat_id,
    CASE WHEN encrypted_aliexpress_app_secret IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_aliexpress_app_secret, enc_key) ELSE NULL END AS aliexpress_app_secret,
    CASE WHEN encrypted_aliexpress_app_key IS NOT NULL 
         THEN extensions.pgp_sym_decrypt(encrypted_aliexpress_app_key, enc_key) ELSE NULL END AS aliexpress_app_key
  INTO cred_record
  FROM public.user_credentials WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN RETURN json_build_object('error', 'No credentials found'); END IF;
  RETURN row_to_json(cred_record);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', 'Decryption failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_account_credentials(
  p_account_id uuid,
  p_telegram_bot_token text DEFAULT NULL,
  p_telegram_chat_id text DEFAULT NULL,
  p_greenapi_api_token text DEFAULT NULL,
  p_greenapi_instance_id text DEFAULT NULL,
  p_greenapi_chat_id text DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enc_key text;
BEGIN
  enc_key := current_setting('app.settings.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'lovable_secure_key_v1';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_accounts WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'Account not found or unauthorized');
  END IF;

  UPDATE public.messaging_accounts SET
    encrypted_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, enc_key) ELSE encrypted_bot_token END,
    telegram_chat_id = COALESCE(NULLIF(p_telegram_chat_id, ''), telegram_chat_id),
    encrypted_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, enc_key) ELSE encrypted_api_token END,
    encrypted_instance_id = CASE 
      WHEN p_greenapi_instance_id IS NOT NULL AND p_greenapi_instance_id != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_instance_id, enc_key) ELSE encrypted_instance_id END,
    whatsapp_chat_id = COALESCE(NULLIF(p_greenapi_chat_id, ''), whatsapp_chat_id),
    updated_at = now()
  WHERE id = p_account_id AND user_id = auth.uid();
    
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_decrypted_messaging_account_credentials(p_account_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acc_record record;
  jwt_role text;
  enc_key text;
BEGIN
  BEGIN
    jwt_role := (current_setting('request.jwt.claims', true)::json ->> 'role');
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  enc_key := current_setting('app.settings.encryption_key', true);
  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'lovable_secure_key_v1';
  END IF;

  SELECT id, user_id, account_type, account_name, is_active, telegram_chat_id, whatsapp_chat_id,
    CASE WHEN encrypted_bot_token IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_bot_token, enc_key) ELSE NULL END AS telegram_bot_token,
    CASE WHEN encrypted_api_token IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_api_token, enc_key) ELSE NULL END AS greenapi_api_token,
    CASE WHEN encrypted_instance_id IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_instance_id, enc_key) ELSE NULL END AS greenapi_instance_id
  INTO acc_record
  FROM public.messaging_accounts WHERE id = p_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN RETURN json_build_object('error', 'Account not found'); END IF;
  RETURN row_to_json(acc_record);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', 'Decryption failed');
END;
$function$;
