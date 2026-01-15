-- Add service-role-only RPC to decrypt messaging account credentials (legacy key)
CREATE OR REPLACE FUNCTION public.get_decrypted_messaging_account_credentials(
  p_account_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acc_record record;
  jwt_role text;
BEGIN
  -- Only allow calls from service role (Edge/Backend functions)
  BEGIN
    jwt_role := (current_setting('request.jwt.claims', true)::json ->> 'role');
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT
    id,
    user_id,
    account_type,
    account_name,
    is_active,
    telegram_chat_id,
    whatsapp_chat_id,
    CASE
      WHEN encrypted_bot_token IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_bot_token, 'lovable_secure_key_v1')
      ELSE NULL
    END AS telegram_bot_token,
    CASE
      WHEN encrypted_api_token IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_api_token, 'lovable_secure_key_v1')
      ELSE NULL
    END AS greenapi_api_token,
    CASE
      WHEN encrypted_instance_id IS NOT NULL THEN extensions.pgp_sym_decrypt(encrypted_instance_id, 'lovable_secure_key_v1')
      ELSE NULL
    END AS greenapi_instance_id
  INTO acc_record
  FROM public.messaging_accounts
  WHERE id = p_account_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Account not found');
  END IF;

  RETURN row_to_json(acc_record);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', 'Decryption failed');
END;
$function$;

-- Lock down RPC to service role only
REVOKE ALL ON FUNCTION public.get_decrypted_messaging_account_credentials(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_decrypted_messaging_account_credentials(uuid, uuid) TO service_role;
