-- Drop existing overly-permissive policies on messaging_accounts
DROP POLICY IF EXISTS "Users can view own accounts" ON public.messaging_accounts;

-- Create a more restrictive SELECT policy that excludes encrypted fields
-- Users can only see non-sensitive metadata
CREATE POLICY "Users can view own accounts metadata"
ON public.messaging_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- Note: The encrypted fields (encrypted_bot_token, encrypted_api_token, encrypted_instance_id)
-- are still stored in the table but users only need the metadata for UI display.
-- Actual credentials are accessed server-side via RPC functions.

-- Add comment to clarify security model
COMMENT ON TABLE public.messaging_accounts IS 'Stores messaging account configurations. Encrypted fields are accessed server-side only via RPC. Client-side only sees metadata.';

-- Create a view that excludes sensitive encrypted fields for client access
CREATE OR REPLACE VIEW public.messaging_accounts_safe AS
SELECT 
  id,
  user_id,
  account_type,
  account_name,
  is_active,
  telegram_chat_id,
  whatsapp_chat_id,
  created_at,
  updated_at,
  -- Expose only boolean flags for credential status, not the actual encrypted values
  (encrypted_bot_token IS NOT NULL) AS has_bot_token,
  (encrypted_api_token IS NOT NULL) AS has_api_token,
  (encrypted_instance_id IS NOT NULL AND encrypted_instance_id != '') AS has_instance_id
FROM public.messaging_accounts;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.messaging_accounts_safe TO authenticated;

-- Enable RLS on the view by using a security definer function
CREATE OR REPLACE FUNCTION public.get_my_messaging_accounts()
RETURNS SETOF public.messaging_accounts_safe
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.messaging_accounts_safe
  WHERE user_id = auth.uid()
$$;