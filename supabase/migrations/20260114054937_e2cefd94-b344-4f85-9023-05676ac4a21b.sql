-- Fix messaging_accounts.encrypted_instance_id type to support encrypted storage (bytea)
-- It was previously text which caused CASE type mismatch in update_account_credentials.

ALTER TABLE public.messaging_accounts
  ALTER COLUMN encrypted_instance_id TYPE bytea
  USING CASE
    WHEN encrypted_instance_id IS NULL OR encrypted_instance_id = '' THEN NULL
    ELSE public.encrypt_credential(encrypted_instance_id)
  END;