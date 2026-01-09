-- Drop the function first, then the view
DROP FUNCTION IF EXISTS public.get_my_messaging_accounts() CASCADE;
DROP VIEW IF EXISTS public.messaging_accounts_safe CASCADE;

-- Create a secure RPC function that returns only safe data
CREATE OR REPLACE FUNCTION public.get_my_messaging_accounts_safe()
RETURNS TABLE (
  id uuid,
  account_type text,
  account_name text,
  is_active boolean,
  telegram_chat_id text,
  whatsapp_chat_id text,
  created_at timestamptz,
  updated_at timestamptz,
  has_bot_token boolean,
  has_api_token boolean,
  has_instance_id boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    account_type,
    account_name,
    is_active,
    telegram_chat_id,
    whatsapp_chat_id,
    created_at,
    updated_at,
    (encrypted_bot_token IS NOT NULL) AS has_bot_token,
    (encrypted_api_token IS NOT NULL) AS has_api_token,
    (encrypted_instance_id IS NOT NULL AND encrypted_instance_id != '') AS has_instance_id
  FROM public.messaging_accounts
  WHERE user_id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_messaging_accounts_safe() IS 'Returns messaging accounts with only safe metadata for the authenticated user. Encrypted credentials are excluded.';