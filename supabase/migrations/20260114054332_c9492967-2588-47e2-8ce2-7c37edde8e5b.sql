-- Fix update_account_credentials to use extensions schema for pgcrypto
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
BEGIN
  -- First verify the account belongs to the current user
  IF NOT EXISTS (
    SELECT 1 FROM public.messaging_accounts 
    WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'Account not found or unauthorized');
  END IF;

  UPDATE public.messaging_accounts
  SET
    encrypted_bot_token = CASE 
      WHEN p_telegram_bot_token IS NOT NULL AND p_telegram_bot_token != '' 
      THEN extensions.pgp_sym_encrypt(p_telegram_bot_token, 'lovable_secure_key_v1')
      ELSE encrypted_bot_token
    END,
    telegram_chat_id = COALESCE(NULLIF(p_telegram_chat_id, ''), telegram_chat_id),
    encrypted_api_token = CASE 
      WHEN p_greenapi_api_token IS NOT NULL AND p_greenapi_api_token != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_api_token, 'lovable_secure_key_v1')
      ELSE encrypted_api_token
    END,
    encrypted_instance_id = CASE 
      WHEN p_greenapi_instance_id IS NOT NULL AND p_greenapi_instance_id != '' 
      THEN extensions.pgp_sym_encrypt(p_greenapi_instance_id, 'lovable_secure_key_v1')
      ELSE encrypted_instance_id
    END,
    whatsapp_chat_id = COALESCE(NULLIF(p_greenapi_chat_id, ''), whatsapp_chat_id),
    updated_at = now()
  WHERE id = p_account_id AND user_id = auth.uid();
    
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;

-- Also fix get_account_credentials_status to use extensions schema
CREATE OR REPLACE FUNCTION public.get_account_credentials_status(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acc_record record;
BEGIN
  SELECT 
    id,
    account_name,
    account_type,
    is_active,
    encrypted_bot_token IS NOT NULL as has_bot_token,
    telegram_chat_id,
    encrypted_api_token IS NOT NULL as has_api_token,
    encrypted_instance_id IS NOT NULL as has_instance_id,
    whatsapp_chat_id
  INTO acc_record
  FROM public.messaging_accounts
  WHERE id = p_account_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;
  
  RETURN row_to_json(acc_record);
END;
$function$;