
-- Revoke execute on sensitive decryption/encryption functions from public roles
-- Only service_role (used by edge functions) should call these

REVOKE ALL ON FUNCTION public.get_decrypted_user_credentials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_user_credentials(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_decrypted_user_credentials(uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_decrypted_messaging_account_credentials(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_decrypted_messaging_account_credentials(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_decrypted_messaging_account_credentials(uuid, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.encrypt_credential(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encrypt_credential(text) FROM anon;
REVOKE ALL ON FUNCTION public.encrypt_credential(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.decrypt_credential(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_credential(bytea) FROM anon;
REVOKE ALL ON FUNCTION public.decrypt_credential(bytea) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_encryption_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_encryption_key() FROM anon;
REVOKE ALL ON FUNCTION public.get_encryption_key() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM anon;
REVOKE ALL ON FUNCTION public.set_encryption_key(text) FROM authenticated;
