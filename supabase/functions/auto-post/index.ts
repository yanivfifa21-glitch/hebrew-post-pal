import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ISRAEL TIME LOGIC (using Asia/Jerusalem timezone) ---
function getIsraelTimeInfo(): { hours: number; minutes: number; dayOfWeek: number; timeStr: string } {
  const now = new Date();
  
  // Use Intl.DateTimeFormat for accurate Israel timezone with proper DST
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short'
  });
  
  const timeParts = timeFormatter.formatToParts(now);
  const hours = parseInt(timeParts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(timeParts.find(p => p.type === 'minute')?.value || '0');
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[dayStr] ?? 0;
  
  return { hours, minutes, dayOfWeek, timeStr };
}

// Check if current time matches any posting time (within 5-minute window)
function isPostingTime(currentTimeStr: string, postingTimes: string[]): boolean {
  const [currH, currM] = currentTimeStr.split(":").map(Number);
  const currentTotalMinutes = currH * 60 + currM;
  
  for (const scheduledTime of postingTimes) {
    const [schedH, schedM] = scheduledTime.split(":").map(Number);
    const scheduledTotalMinutes = schedH * 60 + schedM;
    
    // Allow 5-minute window: current time can be 0-5 minutes AFTER scheduled time
    const diff = currentTotalMinutes - scheduledTotalMinutes;
    if (diff >= 0 && diff <= 5) {
      return true;
    }
  }
  return false;
}
// -------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Anti-Race Condition: Random delay (1-3 seconds) to prevent double execution
  const jitter = Math.floor(Math.random() * 2000) + 1000;
  await new Promise((r) => setTimeout(r, jitter));

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const israelTimeInfo = getIsraelTimeInfo();
    const currentTimeStr = israelTimeInfo.timeStr;
    const currentDayOfWeek = israelTimeInfo.dayOfWeek;

    console.log(`[auto-post] Running at Israel Time: ${currentTimeStr} (Day: ${currentDayOfWeek})`);


    // Get active users with automation enabled
    const { data: settings } = await supabase
      .from("app_settings")
      .select("*")
      .eq("automation_enabled", true);

    if (!settings || settings.length === 0) {
      console.log("[auto-post] No users with automation enabled");
      return new Response(JSON.stringify({ message: "No active users" }), { headers: corsHeaders });
    }

    const results = [];

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const postingTimes: string[] = userSettings.posting_times || [];
      const publishingDays: number[] = userSettings.publishing_days || [0, 1, 2, 3, 4, 5, 6];

      console.log(`[auto-post] User ${userId}: Configured times: [${postingTimes.join(", ")}], days: [${publishingDays.join(", ")}]`);

      // Step A: Check if today is a publishing day
      if (!publishingDays.includes(currentDayOfWeek)) {
        console.log(`[auto-post] User ${userId}: Skipping - Day ${currentDayOfWeek} not in publishing days`);
        results.push({ userId, status: "skipped_day" });
        continue;
      }

      // Step B: Check if current time matches ANY of the user's posting times
      if (!isPostingTime(currentTimeStr, postingTimes)) {
        // Don't log every minute to reduce noise - only log occasionally
        results.push({ userId, status: "not_posting_time" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: ✓ Time ${currentTimeStr} matches! Searching for scheduled product...`);

      // Step C: Fetch ONE product with status 'Scheduled' OR 'processing' (oldest first)
      // This allows recovery of stuck products
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["Scheduled", "processing"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error(`[auto-post] User ${userId}: Error fetching product: ${fetchError.message}`);
        results.push({ userId, status: "fetch_error", error: fetchError.message });
        continue;
      }

      if (!product) {
        console.log(`[auto-post] User ${userId}: No 'Scheduled' or 'processing' products in queue`);
        results.push({ userId, status: "queue_empty" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: Found product ${product.id}. Locking...`);

      // Step D: LOCK IT - Update status to 'processing' to prevent double-send
      const { error: lockError, count } = await supabase
        .from("products")
        .update({ status: "processing" })
        .eq("id", product.id)
        .eq("status", "Scheduled"); // Only lock if still Scheduled (atomic check)

      if (lockError) {
        console.error(`[auto-post] User ${userId}: Failed to lock product: ${lockError.message}`);
        results.push({ userId, status: "lock_failed", productId: product.id });
        continue;
      }

      // Step E: Build message and send
      const message = buildMessage(product);
      let sendSuccess = false;
      let sentTo: string[] = [];

      // Try Telegram
      if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
        try {
          await sendToTelegram(userSettings.telegram_bot_token, userSettings.telegram_chat_id, product, message);
          sendSuccess = true;
          sentTo.push("telegram");
          console.log(`[auto-post] User ${userId}: ✓ Sent to Telegram`);
        } catch (e) {
          console.error(`[auto-post] User ${userId}: Telegram failed: ${e}`);
        }
      }

      // Try WhatsApp (GreenAPI)
      if (userSettings.whatsapp_enabled && userSettings.greenapi_instance_id && userSettings.greenapi_api_token && userSettings.greenapi_chat_id) {
        try {
          await sendToWhatsApp(
            userSettings.greenapi_instance_id,
            userSettings.greenapi_api_token,
            userSettings.greenapi_chat_id,
            product,
            message,
          );
          sendSuccess = true;
          sentTo.push("whatsapp");
          console.log(`[auto-post] User ${userId}: ✓ Sent to WhatsApp`);
        } catch (e) {
          console.error(`[auto-post] User ${userId}: WhatsApp failed: ${e}`);
        }
      }

      // Step F: Final Status Update
      // If BOTH channels failed, reset to 'Scheduled' for retry
      let finalStatus: string;
      if (sendSuccess) {
        finalStatus = "sent";
      } else {
        // No channel succeeded - reset to Scheduled for retry
        finalStatus = "Scheduled";
        console.log(`[auto-post] User ${userId}: Both channels failed - resetting product to 'Scheduled' for retry`);
      }
      
      const { error: finalUpdateError } = await supabase
        .from("products")
        .update({ status: finalStatus })
        .eq("id", product.id);

      if (finalUpdateError) {
        console.error(`[auto-post] User ${userId}: Failed to update final status: ${finalUpdateError.message}`);
      }

      console.log(`[auto-post] User ${userId}: Product ${product.id} -> ${finalStatus} (sent to: ${sentTo.join(", ") || "none"})`);
      results.push({ userId, productId: product.id, status: finalStatus, sentTo });
    }

    return new Response(JSON.stringify({ success: true, time: currentTimeStr, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-post] Critical Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

// --- HELPER FUNCTIONS ---

// Message builder - includes title, price, and description
function buildMessage(product: Record<string, unknown>): string {
  const title = String(product.title ?? "").trim();
  const price = product.price ? `₪${Number(product.price).toFixed(2)}` : "";
  const description = String(product.hebrew_description ?? "").trim();
  const affiliateLink = String(product.affiliate_link ?? "").trim();
  
  // Build message with all components
  const parts: string[] = [];
  
  if (title) parts.push(`🛒 *${title}*`);
  if (price) parts.push(`💰 ${price}`);
  if (description) parts.push(`\n${description}`);
  if (affiliateLink) parts.push(`\n🔗 ${affiliateLink}`);
  
  return parts.join("\n");
}

// Telegram sender
async function sendToTelegram(token: string, chatId: string, product: any, text: string) {
  const url = `https://api.telegram.org/bot${token}/${product.image_url ? "sendPhoto" : "sendMessage"}`;
  const body: any = { chat_id: chatId, parse_mode: "Markdown" };

  if (product.image_url) {
    body.photo = product.image_url;
    body.caption = text;
  } else {
    body.text = text;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

// WhatsApp sender (GreenAPI)
async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
  if (!chatId.includes("@")) chatId = `${chatId}@${chatId.length > 15 ? "g.us" : "c.us"}`;

  const baseUrl = `https://api.green-api.com/waInstance${instance}`;
  const url = product.image_url ? `${baseUrl}/sendFileByUrl/${token}` : `${baseUrl}/sendMessage/${token}`;

  const body: any = { chatId };
  if (product.image_url) {
    body.urlFile = product.image_url;
    body.fileName = "image.jpg";
    body.caption = text;
  } else {
    body.message = text;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}
