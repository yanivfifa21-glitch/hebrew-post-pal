import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ error: "ENCRYPTION_KEY not configured in secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_DB_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use direct Postgres connection to set the role config
    // Import postgres driver
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    
    const sql = postgres(dbUrl);
    
    try {
      // Set encryption key on authenticator role so it's available via current_setting
      await sql.unsafe(`ALTER ROLE authenticator SET app.settings.encryption_key = '${encryptionKey.replace(/'/g, "''")}'`);
      
      // Also update vault secret if possible
      try {
        await sql.unsafe(`UPDATE vault.secrets SET secret = '${encryptionKey.replace(/'/g, "''")}' WHERE name = 'encryption_key'`);
      } catch (_e) {
        // vault update is optional
      }

      // Now re-encrypt existing data from old key to new key
      const oldKey = 'lovable_secure_key_v1';
      
      // Re-encrypt user_credentials
      await sql.unsafe(`
        UPDATE public.user_credentials SET
          encrypted_telegram_bot_token = CASE 
            WHEN encrypted_telegram_bot_token IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_telegram_bot_token, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          encrypted_greenapi_api_token = CASE 
            WHEN encrypted_greenapi_api_token IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_greenapi_api_token, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          encrypted_aliexpress_app_secret = CASE 
            WHEN encrypted_aliexpress_app_secret IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_aliexpress_app_secret, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          encrypted_aliexpress_app_key = CASE 
            WHEN encrypted_aliexpress_app_key IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_aliexpress_app_key, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          updated_at = now()
      `);

      // Re-encrypt messaging_accounts
      await sql.unsafe(`
        UPDATE public.messaging_accounts SET
          encrypted_bot_token = CASE 
            WHEN encrypted_bot_token IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_bot_token, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          encrypted_api_token = CASE 
            WHEN encrypted_api_token IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_api_token, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          encrypted_instance_id = CASE 
            WHEN encrypted_instance_id IS NOT NULL 
            THEN extensions.pgp_sym_encrypt(
              extensions.pgp_sym_decrypt(encrypted_instance_id, '${oldKey}'), 
              '${encryptionKey.replace(/'/g, "''")}'
            ) ELSE NULL END,
          updated_at = now()
      `);

      await sql.end();
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Encryption key configured and all credentials re-encrypted" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (dbErr) {
      await sql.end();
      throw dbErr;
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
