import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  title: string;
  hebrewDescription: string;
  price: number;
  imageUrl: string | null;
  affiliateLink: string | null;
  userId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[send-whatsapp] Missing authorization header");
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
      console.error("[send-whatsapp] Auth verification failed:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, hebrewDescription, price, imageUrl, affiliateLink, userId }: WhatsAppRequest = await req.json();

    // SECURITY: Verify the userId matches the authenticated user
    if (userId !== user.id) {
      console.error("[send-whatsapp] User ID mismatch - potential attack");
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Cannot access other users' data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to fetch decrypted credentials via RPC
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user's decrypted credentials via RPC (server-side only)
    const { data: credentials, error: credentialsError } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

    if (credentialsError || credentials?.error) {
      console.error("[send-whatsapp] Error fetching credentials:", credentialsError || credentials?.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch user credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceId = credentials?.greenapi_instance_id?.trim();
    const apiToken = credentials?.greenapi_api_token?.trim();
    let chatId = credentials?.greenapi_chat_id?.trim();

    if (!instanceId || !apiToken || !chatId) {
      console.error("[send-whatsapp] Missing user credentials");
      return new Response(
        JSON.stringify({ success: false, error: "Please configure your WhatsApp (GreenAPI) credentials in Settings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format chat ID correctly for GreenAPI
    chatId = chatId.replace(/[\s+\-]/g, '').trim();
    
    if (!chatId.includes('@')) {
      if (chatId.length > 15 || chatId.startsWith('120')) {
        chatId = chatId + '@g.us';
      } else {
        chatId = chatId + '@c.us';
      }
    }
    
    console.log("[send-whatsapp] Sending for user:", user.email);

    const message = hebrewDescription;

    console.log("[send-whatsapp] Message preview:", message.substring(0, 100) + "...");

    // If there's an image, send image with caption
    if (imageUrl) {
      const imageResponse = await fetch(
        `https://api.greenapi.com/waInstance${instanceId}/sendFileByUrl/${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatId,
            urlFile: imageUrl,
            fileName: "product.jpg",
            caption: message,
          }),
        }
      );

      const imageResult = await imageResponse.json();
      console.log("[send-whatsapp] GreenAPI image response:", imageResult);

      if (imageResult.idMessage) {
        return new Response(
          JSON.stringify({ success: true, messageId: imageResult.idMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(imageResult.message || "Failed to send image");
      }
    } else {
      const textResponse = await fetch(
        `https://api.greenapi.com/waInstance${instanceId}/sendMessage/${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatId,
            message: message,
          }),
        }
      );

      const textResult = await textResponse.json();
      console.log("[send-whatsapp] GreenAPI text response:", textResult);

      if (textResult.idMessage) {
        return new Response(
          JSON.stringify({ success: true, messageId: textResult.idMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(textResult.message || "Failed to send message");
      }
    }
  } catch (error: unknown) {
    console.error("[send-whatsapp] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
