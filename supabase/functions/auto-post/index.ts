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

    console.log("[auto-post] Starting automation check...");

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
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const postingTimes = userSettings.posting_times || [];

      console.log(`[auto-post] Checking user ${userId}, posting times:`, postingTimes);

      // Check if current time matches any posting window (with 2 min tolerance)
      const shouldPost = postingTimes.some((time: string) => {
        const [h, m] = time.split(':').map(Number);
        const targetMinutes = h * 60 + m;
        const diff = Math.abs(currentMinutes - targetMinutes);
        return diff <= 2 || diff >= (24 * 60 - 2); // Handle midnight edge case
      });

      if (!shouldPost) {
        console.log(`[auto-post] User ${userId}: Not posting time (current: ${now.getHours()}:${now.getMinutes()})`);
        results.push({ userId, status: "skipped", reason: "Not posting time" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: It's posting time! Looking for queued products...`);

      // Get next queued product for this user (FIFO - oldest first)
      const { data: product, error: productErr } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["queued", "scheduled"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (productErr) {
        console.error(`[auto-post] Product fetch error for user ${userId}:`, productErr);
        results.push({ userId, status: "error", error: productErr.message });
        continue;
      }

      if (!product) {
        console.log(`[auto-post] User ${userId}: No queued/scheduled products found`);
        results.push({ userId, status: "skipped", reason: "No queued products" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: Found product ${product.id} - "${product.title}"`);

      // Get ALL active messaging accounts for this user
      const { data: accounts, error: accountsErr } = await supabase
        .from("messaging_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (accountsErr) {
        console.error(`[auto-post] Accounts fetch error for user ${userId}:`, accountsErr);
      }

      const channels: string[] = [];
      const errors: string[] = [];

      // Build message content
      const message = product.hebrew_description || product.title || "New deal!";

      // Send to all active accounts
      if (accounts && accounts.length > 0) {
        for (const account of accounts) {
          if (account.account_type === "telegram" && account.telegram_bot_token && account.telegram_chat_id) {
            try {
              console.log(`[auto-post] Sending to Telegram account: ${account.account_name}`);
              const telegramUrl = `https://api.telegram.org/bot${account.telegram_bot_token}/sendPhoto`;
              
              const telegramResp = await fetch(telegramUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: account.telegram_chat_id,
                  photo: product.image_url || "https://via.placeholder.com/400",
                  caption: message.substring(0, 1024),
                  parse_mode: "Markdown",
                }),
              });

              if (telegramResp.ok) {
                channels.push(`telegram:${account.account_name}`);
                console.log(`[auto-post] Telegram sent successfully to ${account.account_name}`);
              } else {
                const errText = await telegramResp.text();
                console.error(`[auto-post] Telegram error for ${account.account_name}:`, errText);
                errors.push(`Telegram(${account.account_name}): ${errText}`);
              }
            } catch (e) {
              console.error(`[auto-post] Telegram exception for ${account.account_name}:`, e);
              errors.push(`Telegram(${account.account_name}): ${e}`);
            }
          }

          if (account.account_type === "whatsapp" && account.greenapi_instance_id && account.greenapi_api_token) {
            try {
              console.log(`[auto-post] Sending to WhatsApp account: ${account.account_name}`);
              
              // Format chat ID for GreenAPI
              let chatId = account.greenapi_chat_id || "";
              if (chatId && !chatId.includes("@")) {
                chatId = chatId.includes("-") ? `${chatId}@g.us` : `${chatId}@c.us`;
              }

              // Send image with caption if we have an image
              if (product.image_url) {
                const sendFileUrl = `https://api.green-api.com/waInstance${account.greenapi_instance_id}/sendFileByUrl/${account.greenapi_api_token}`;
                const whatsappResp = await fetch(sendFileUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chatId: chatId,
                    urlFile: product.image_url,
                    fileName: "deal.jpg",
                    caption: message,
                  }),
                });

                if (whatsappResp.ok) {
                  channels.push(`whatsapp:${account.account_name}`);
                  console.log(`[auto-post] WhatsApp sent successfully to ${account.account_name}`);
                } else {
                  const errText = await whatsappResp.text();
                  console.error(`[auto-post] WhatsApp error for ${account.account_name}:`, errText);
                  errors.push(`WhatsApp(${account.account_name}): ${errText}`);
                }
              } else {
                // Send text only
                const sendMessageUrl = `https://api.green-api.com/waInstance${account.greenapi_instance_id}/sendMessage/${account.greenapi_api_token}`;
                const whatsappResp = await fetch(sendMessageUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chatId: chatId,
                    message: message,
                  }),
                });

                if (whatsappResp.ok) {
                  channels.push(`whatsapp:${account.account_name}`);
                  console.log(`[auto-post] WhatsApp text sent successfully to ${account.account_name}`);
                } else {
                  const errText = await whatsappResp.text();
                  console.error(`[auto-post] WhatsApp error for ${account.account_name}:`, errText);
                  errors.push(`WhatsApp(${account.account_name}): ${errText}`);
                }
              }
            } catch (e) {
              console.error(`[auto-post] WhatsApp exception for ${account.account_name}:`, e);
              errors.push(`WhatsApp(${account.account_name}): ${e}`);
            }
          }
        }
      } else {
        console.log(`[auto-post] User ${userId}: No active messaging accounts found`);
        
        // Fallback to legacy single-account settings
        if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
          try {
            const telegramUrl = `https://api.telegram.org/bot${userSettings.telegram_bot_token}/sendPhoto`;
            const telegramResp = await fetch(telegramUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: userSettings.telegram_chat_id,
                photo: product.image_url || "https://via.placeholder.com/400",
                caption: message.substring(0, 1024),
                parse_mode: "Markdown",
              }),
            });

            if (telegramResp.ok) {
              channels.push("telegram");
            } else {
              const errText = await telegramResp.text();
              errors.push(`Telegram: ${errText}`);
            }
          } catch (e) {
            errors.push(`Telegram: ${e}`);
          }
        }

        if (userSettings.whatsapp_enabled && userSettings.greenapi_instance_id && userSettings.greenapi_api_token) {
          try {
            let chatId = userSettings.greenapi_chat_id || "";
            if (chatId && !chatId.includes("@")) {
              chatId = chatId.includes("-") ? `${chatId}@g.us` : `${chatId}@c.us`;
            }

            const sendMessageUrl = `https://api.green-api.com/waInstance${userSettings.greenapi_instance_id}/sendMessage/${userSettings.greenapi_api_token}`;
            const whatsappResp = await fetch(sendMessageUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId: chatId,
                message: message,
              }),
            });

            if (whatsappResp.ok) {
              channels.push("whatsapp");
            } else {
              const errText = await whatsappResp.text();
              errors.push(`WhatsApp: ${errText}`);
            }
          } catch (e) {
            errors.push(`WhatsApp: ${e}`);
          }
        }
      }

      // Update product status
      if (channels.length > 0) {
        console.log(`[auto-post] Updating product ${product.id} status to 'sent'`);
        await supabase
          .from("products")
          .update({ status: "sent", channels })
          .eq("id", product.id);

        results.push({ userId, productId: product.id, status: "sent", channels });
      } else if (errors.length > 0) {
        console.log(`[auto-post] Product ${product.id} had send errors:`, errors);
        results.push({ userId, productId: product.id, status: "error", errors });
      } else {
        console.log(`[auto-post] User ${userId}: No channels configured`);
        results.push({ userId, status: "skipped", reason: "No channels enabled" });
      }
    }

    console.log("[auto-post] Final results:", JSON.stringify(results, null, 2));
    return new Response(JSON.stringify({ success: true, results, timestamp: now.toISOString() }), {
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
