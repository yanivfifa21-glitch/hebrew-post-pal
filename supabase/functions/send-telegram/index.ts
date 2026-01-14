import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramRequest {
  title: string;
  hebrewDescription: string;
  price: number;
  imageUrl: string | null;
  affiliateLink: string | null;
  userId: string;
  accountId?: string; // Optional: specific account to use
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[send-telegram] Missing authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify user with anon key
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      console.error("[send-telegram] Auth verification failed:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, hebrewDescription, price, imageUrl, affiliateLink, userId, accountId }: TelegramRequest = await req.json();

    // SECURITY: Verify the userId matches the authenticated user
    if (userId !== user.id) {
      console.error("[send-telegram] User ID mismatch - potential attack");
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Cannot access other users' data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to fetch credentials
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let botToken: string | null = null;
    let chatId: string | null = null;

    // If accountId is provided, fetch from messaging_accounts
    if (accountId) {
      console.log("[send-telegram] Fetching credentials for account:", accountId);
      
      // First verify the account belongs to this user
      const { data: account, error: accountError } = await supabase
        .from("messaging_accounts")
        .select("*")
        .eq("id", accountId)
        .eq("user_id", user.id)
        .single();

      if (accountError || !account) {
        console.error("[send-telegram] Account not found or unauthorized:", accountError);
        return new Response(
          JSON.stringify({ success: false, error: "Account not found or unauthorized" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get decrypted credentials via RPC
      const { data: credentials, error: credError } = await supabase
        .rpc("get_account_credentials_status", { p_account_id: accountId });

      if (credError) {
        console.error("[send-telegram] Error fetching account credentials:", credError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch account credentials" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Decrypt the bot token directly
      if (account.encrypted_bot_token) {
        const { data: decrypted } = await supabase.rpc("decrypt_credential", { 
          encrypted_data: account.encrypted_bot_token 
        });
        botToken = decrypted?.trim() || null;
      }
      chatId = account.telegram_chat_id?.trim() || null;

    } else {
      // Fallback: fetch from user_credentials (legacy)
      console.log("[send-telegram] Using legacy user_credentials");
      const { data: credentials, error: credentialsError } = await supabase
        .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

      if (credentialsError || credentials?.error) {
        console.error("[send-telegram] Error fetching credentials:", credentialsError || credentials?.error);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch user credentials" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      botToken = credentials?.telegram_bot_token?.trim() || null;
      chatId = credentials?.telegram_chat_id?.trim() || null;
    }

    if (!botToken || !chatId) {
      console.error("[send-telegram] Missing credentials - botToken:", !!botToken, "chatId:", !!chatId);
      return new Response(
        JSON.stringify({ success: false, error: "הגדר Bot Token ו-Chat ID בהגדרות הטלגרם" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use hebrewDescription as-is (it already contains the affiliate link)
    const caption = hebrewDescription;

    console.log("[send-telegram] Sending for user:", user.email);
    console.log("[send-telegram] Caption preview:", caption.substring(0, 100) + "...");

    let result;

    // If there's an image, use sendPhoto, otherwise sendMessage
    if (imageUrl) {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: caption,
            parse_mode: "HTML",
          }),
        }
      );
      result = await response.json();
      console.log("[send-telegram] sendPhoto response:", JSON.stringify(result));
    } else {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: caption,
            parse_mode: "HTML",
          }),
        }
      );
      result = await response.json();
      console.log("[send-telegram] sendMessage response:", JSON.stringify(result));
    }

    if (result.ok) {
      return new Response(
        JSON.stringify({ success: true, messageId: result.result?.message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("[send-telegram] Telegram API error:", result);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.description || "Failed to send message",
          code: result.error_code 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("[send-telegram] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});