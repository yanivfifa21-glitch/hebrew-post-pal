import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { groupId, action } = await req.json();

    if (!groupId) {
      return new Response(JSON.stringify({ error: "groupId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the relay group
    const { data: group, error: groupError } = await supabase
      .from("relay_groups")
      .select("*")
      .eq("id", groupId)
      .eq("user_id", userId)
      .single();

    if (groupError || !group) {
      return new Response(JSON.stringify({ error: "Group not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!group.bot_token) {
      return new Response(JSON.stringify({ error: "Bot token not configured for this group" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-listener-webhook`;

    if (action === "remove") {
      // Remove webhook
      const resp = await fetch(`https://api.telegram.org/bot${group.bot_token}/deleteWebhook`);
      const result = await resp.json();

      await supabase
        .from("relay_groups")
        .update({ webhook_active: false })
        .eq("id", groupId);

      return new Response(JSON.stringify({ success: true, result, webhook_active: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set webhook
    const resp = await fetch(`https://api.telegram.org/bot${group.bot_token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "channel_post"],
        drop_pending_updates: false,
      }),
    });

    const result = await resp.json();

    if (result.ok) {
      await supabase
        .from("relay_groups")
        .update({ webhook_active: true })
        .eq("id", groupId);

      return new Response(JSON.stringify({ success: true, result, webhook_active: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: result.description || "Failed to set webhook" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("[setup-telegram-webhook] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
