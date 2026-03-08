
-- Store encryption key directly in the encryption_config table
-- This table has RLS that denies all client access, only SECURITY DEFINER functions can read it

-- Drop the bytea column constraint and use text instead
ALTER TABLE public.encryption_config DROP COLUMN IF EXISTS encrypted_key;
ALTER TABLE public.encryption_config ADD COLUMN IF NOT EXISTS key_value text;

-- Update get_encryption_key to read from this table
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enc_key text;
BEGIN
  SELECT key_value INTO enc_key FROM public.encryption_config WHERE id = 1;
  
  IF enc_key IS NOT NULL AND enc_key != '' THEN
    RETURN enc_key;
  END IF;
  
  RAISE EXCEPTION 'Encryption key not configured. Run init-encryption-key edge function.';
END;
$$;

-- Create a function to set the key (callable only by service_role via edge functions)
CREATE OR REPLACE FUNCTION public.set_encryption_key(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.encryption_config (id, key_value) VALUES (1, p_key)
  ON CONFLICT (id) DO UPDATE SET key_value = p_key;
END;
$$;

-- Restrict to service_role only
REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM anon;
REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM authenticated;

-- Drop the vault helper we don't need
DROP FUNCTION IF EXISTS public.update_vault_encryption_key(text);
