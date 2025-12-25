import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with automation enabled
    const { data: settings, error: settingsErr } = await supabase
      .from("app_settings")
      .select("*")
      .eq("automation_enabled", true);

    if (settingsErr) {
      console.error("[auto-post] Settings error:", settingsErr);
      return new Response(JSON.stringify({ success: false, error: settingsErr.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!settings || settings.length === 0) {
      console.log("[auto-post] No users with automation enabled");
      return new Response(JSON.stringify({ success: true, message: "No automation enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const postingTimes = userSettings.posting_times || [];

      // Check if current time matches any posting window (with 5 min tolerance)
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const shouldPost = postingTimes.some((time: string) => {
        const [h, m] = time.split(':').map(Number);
        const targetMinutes = h * 60 + m;
        return Math.abs(currentMinutes - targetMinutes) <= 5;
      });

      if (!shouldPost) {
        results.push({ userId, status: "skipped", reason: "Not posting time" });
        continue;
      }

      // Get next queued product for this user
      const { data: product, error: productErr } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (productErr || !product) {
        results.push({ userId, status: "skipped", reason: "No queued products" });
        continue;
      }

      const channels: string[] = [];
      let sendError = null;

      // Send to Telegram if enabled
      if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
        try {
          const telegramUrl = `https://api.telegram.org/bot${userSettings.telegram_bot_token}/sendPhoto`;
          const caption = `${product.hebrew_description || product.title}`;
          
          const telegramResp = await fetch(telegramUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: userSettings.telegram_chat_id,
              photo: product.image_url,
              caption: caption.substring(0, 1024),
              parse_mode: "Markdown",
            }),
          });

          if (telegramResp.ok) {
            channels.push("telegram");
            console.log(`[auto-post] Telegram sent for product ${product.id}`);
          } else {
            const errText = await telegramResp.text();
            console.error("[auto-post] Telegram error:", errText);
            sendError = `Telegram: ${errText}`;
          }
        } catch (e) {
          console.error("[auto-post] Telegram exception:", e);
          sendError = `Telegram: ${e}`;
        }
      }

      // Send to WhatsApp if enabled
      if (userSettings.whatsapp_enabled && userSettings.greenapi_instance_id && userSettings.greenapi_api_token) {
        try {
          const greenApiUrl = `https://api.green-api.com/waInstance${userSettings.greenapi_instance_id}/sendMessage/${userSettings.greenapi_api_token}`;
          const message = `${product.hebrew_description || product.title}`;
          
          const whatsappResp = await fetch(greenApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: userSettings.greenapi_chat_id,
              message: message,
            }),
          });

          if (whatsappResp.ok) {
            channels.push("whatsapp");
            console.log(`[auto-post] WhatsApp sent for product ${product.id}`);
          } else {
            const errText = await whatsappResp.text();
            console.error("[auto-post] WhatsApp error:", errText);
            sendError = sendError ? `${sendError}; WhatsApp: ${errText}` : `WhatsApp: ${errText}`;
          }
        } catch (e) {
          console.error("[auto-post] WhatsApp exception:", e);
          sendError = sendError ? `${sendError}; WhatsApp: ${e}` : `WhatsApp: ${e}`;
        }
      }

      // Update product status
      if (channels.length > 0) {
        await supabase
          .from("products")
          .update({ status: "sent", channels })
          .eq("id", product.id);

        results.push({ userId, productId: product.id, status: "sent", channels });
      } else if (sendError) {
        results.push({ userId, productId: product.id, status: "error", error: sendError });
      } else {
        results.push({ userId, status: "skipped", reason: "No channels enabled" });
      }
    }

    console.log("[auto-post] Results:", results);
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-post] Error:", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
