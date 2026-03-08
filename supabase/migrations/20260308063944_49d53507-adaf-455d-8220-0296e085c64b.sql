
-- Store the encryption key in a protected table, encrypted with pgcrypto using a DB-level key
-- The key is already in vault but vault.decrypted_secrets needs special permissions

-- Grant the get_encryption_key function owner access to vault
GRANT SELECT ON vault.decrypted_secrets TO postgres;

-- Update function to use correct owner context  
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  enc_key text;
BEGIN
  -- Read from vault (SECURITY DEFINER runs as function owner = postgres)
  SELECT decrypted_secret INTO enc_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'encryption_key' 
  LIMIT 1;
  
  IF enc_key IS NOT NULL AND enc_key != '' AND enc_key != 'PLACEHOLDER_WILL_BE_SET' THEN
    RETURN enc_key;
  END IF;
  
  RAISE EXCEPTION 'Encryption key not configured in vault';
END;
$$;
