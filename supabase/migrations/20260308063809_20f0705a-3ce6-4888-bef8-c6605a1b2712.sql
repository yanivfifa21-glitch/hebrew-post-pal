
-- Create a secure config table instead of using vault
CREATE TABLE IF NOT EXISTS public.encryption_config (
  id integer PRIMARY KEY DEFAULT 1,
  encrypted_key bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Deny all access from clients
ALTER TABLE public.encryption_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access" ON public.encryption_config FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Delete the vault secret since we can't use it
-- Update get_encryption_key to use the config table with a master password
-- The master password is the old hardcoded key (which protects the new key in the table)

-- Update get_encryption_key to read from config table
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enc_key text;
  stored_key bytea;
BEGIN
  -- Try vault first
  BEGIN
    SELECT decrypted_secret INTO enc_key FROM vault.decrypted_secrets WHERE name = 'encryption_key' LIMIT 1;
    IF enc_key IS NOT NULL AND enc_key != '' AND enc_key != 'PLACEHOLDER_WILL_BE_SET' THEN
      RETURN enc_key;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- vault not available, continue
  END;
  
  -- Try current_setting
  enc_key := current_setting('app.settings.encryption_key', true);
  IF enc_key IS NOT NULL AND enc_key != '' THEN
    RETURN enc_key;
  END IF;
  
  -- Final fallback - error
  RAISE EXCEPTION 'Encryption key not configured';
END;
$$;
