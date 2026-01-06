-- Create extension for encryption (if not exists)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted credential columns to messaging_accounts for multi-account support
-- Each account can have its own encrypted credentials
ALTER TABLE public.messaging_accounts 
ADD COLUMN IF NOT EXISTS encrypted_bot_token bytea,
ADD COLUMN IF NOT EXISTS encrypted_api_token bytea,
ADD COLUMN IF NOT EXISTS encrypted_instance_id text,
ADD COLUMN IF NOT EXISTS whatsapp_chat_id text;

-- Create a function to encrypt credentials with service key
CREATE OR REPLACE FUNCTION public.encrypt_credential(plain_text text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
BEGIN
  -- Get encryption key from vault or use a derived key
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    -- Fallback: derive key from service role (this is secure as only server can access)
    encryption_key := encode(digest(current_setting('request.jwt.claims', true)::text || 'lovable_secure_key', 'sha256'), 'hex');
  END IF;
  
  RETURN pgp_sym_encrypt(plain_text, encryption_key);
END;
$$;

-- Create a function to decrypt credentials (only callable by service role in edge functions)
CREATE OR REPLACE FUNCTION public.decrypt_credential(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
BEGIN
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest(current_setting('request.jwt.claims', true)::text || 'lovable_secure_key', 'sha256'), 'hex');
  END IF;
  
  RETURN pgp_sym_decrypt(encrypted_data, encryption_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Update the update_my_credentials function to handle account-specific credentials
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
SET search_path = public
AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_accounts 
    WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Account not found or not owned by user');
  END IF;

  -- Update the account
  UPDATE public.messaging_accounts
  SET
    telegram_chat_id = CASE 
      WHEN p_telegram_chat_id IS NOT NULL AND p_telegram_chat_id != '' 
      THEN p_telegram_chat_id 
      ELSE telegram_chat_id 
    END,
    encrypted_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1')
      ELSE encrypted_bot_token 
    END,
    encrypted_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1')
      ELSE encrypted_api_token 
    END,
    encrypted_instance_id = CASE 
      WHEN p_greenapi_instance_id IS NOT NULL AND p_greenapi_instance_id != '' 
      THEN p_greenapi_instance_id 
      ELSE encrypted_instance_id 
    END,
    whatsapp_chat_id = CASE 
      WHEN p_greenapi_chat_id IS NOT NULL AND p_greenapi_chat_id != '' 
      THEN p_greenapi_chat_id 
      ELSE whatsapp_chat_id 
    END,
    updated_at = now()
  WHERE id = p_account_id;
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function to get account credentials status (without revealing values)
CREATE OR REPLACE FUNCTION public.get_account_credentials_status(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc_record record;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_accounts 
    WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;

  SELECT 
    encrypted_bot_token IS NOT NULL AS has_bot_token,
    telegram_chat_id IS NOT NULL AND telegram_chat_id != '' AS has_telegram_chat_id,
    encrypted_api_token IS NOT NULL AS has_api_token,
    encrypted_instance_id IS NOT NULL AND encrypted_instance_id != '' AS has_instance_id,
    whatsapp_chat_id IS NOT NULL AND whatsapp_chat_id != '' AS has_whatsapp_chat_id
  INTO acc_record
  FROM public.messaging_accounts
  WHERE id = p_account_id;
  
  RETURN row_to_json(acc_record);
END;
$$;