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

// Check if current time matches any posting time EXACTLY (same HH:MM)
function isPostingTime(currentTimeStr: string, postingTimes: string[]): boolean {
  return postingTimes.includes(currentTimeStr);
}

// Convert time string to minutes since midnight
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Check if we're in Shabbat mode
function isInShabbatMode(
  dayOfWeek: number,
  currentTimeStr: string,
  shabbatEnabled: boolean,
  shabbatStartTime: string,
  shabbatEndTime: string
): boolean {
  if (!shabbatEnabled) return false;
  
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(shabbatStartTime);
  const endMinutes = timeToMinutes(shabbatEndTime);
  
  // Friday (day 5) after start time
  if (dayOfWeek === 5 && currentMinutes >= startMinutes) {
    return true;
  }
  
  // Saturday (day 6) before end time
  if (dayOfWeek === 6 && currentMinutes < endMinutes) {
    return true;
  }
  
  return false;
}

// Check if current time is within interval posting range
function isWithinIntervalTimeRange(
  currentTimeStr: string,
  intervalStartTime: string,
  intervalEndTime: string
): boolean {
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(intervalStartTime);
  const endMinutes = timeToMinutes(intervalEndTime);
  
  // Handle normal range (start < end, e.g., 08:00 - 22:00)
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  
  // Handle overnight range (start > end, e.g., 22:00 - 06:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

// Check if interval posting should trigger (now uses MINUTES)
function shouldPostByInterval(
  intervalMinutes: number | null,
  lastSentTime: string | null
): boolean {
  if (!intervalMinutes) return false;
  if (!lastSentTime) return true; // No previous send, go ahead
  
  const lastSent = new Date(lastSentTime);
  const now = new Date();
  const diffMs = now.getTime() - lastSent.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  
  return diffMinutes >= intervalMinutes;
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
      // Use new minutes column, fallback to hours*60 for backwards compatibility
      const intervalMinutes: number | null = userSettings.posting_interval_minutes || 
        (userSettings.posting_interval_hours ? userSettings.posting_interval_hours * 60 : null);
      const shabbatEnabled: boolean = userSettings.shabbat_mode_enabled || false;
      const shabbatStartTime: string = userSettings.shabbat_start_time || '14:00';
      const shabbatEndTime: string = userSettings.shabbat_end_time || '20:00';
      const intervalStartTime: string = userSettings.interval_start_time || '08:00';
      const intervalEndTime: string = userSettings.interval_end_time || '22:00';

      console.log(`[auto-post] User ${userId}: Interval: ${intervalMinutes}min (${intervalStartTime}-${intervalEndTime}), Shabbat: ${shabbatEnabled}, times: [${postingTimes.join(", ")}]`);

      // Step A: Check Shabbat mode first
      if (isInShabbatMode(currentDayOfWeek, currentTimeStr, shabbatEnabled, shabbatStartTime, shabbatEndTime)) {
        console.log(`[auto-post] User ${userId}: Skipping - Shabbat mode active`);
        results.push({ userId, status: "shabbat_mode" });
        continue;
      }

      // Step B: Check if today is a publishing day
      if (!publishingDays.includes(currentDayOfWeek)) {
        console.log(`[auto-post] User ${userId}: Skipping - Day ${currentDayOfWeek} not in publishing days`);
        results.push({ userId, status: "skipped_day" });
        continue;
      }

      // Step C: Determine if we should post (fixed times OR interval)
      let shouldPost = false;
      
      if (intervalMinutes) {
        // Interval mode: first check if we're within the allowed time range
        if (!isWithinIntervalTimeRange(currentTimeStr, intervalStartTime, intervalEndTime)) {
          console.log(`[auto-post] User ${userId}: Skipping - Current time ${currentTimeStr} outside interval range ${intervalStartTime}-${intervalEndTime}`);
          results.push({ userId, status: "outside_interval_range" });
          continue;
        }
        
        // Then check if enough time passed since last send
        const { data: lastSent } = await supabase
          .from("products")
          .select("updated_at")
          .eq("user_id", userId)
          .eq("status", "Sent")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        shouldPost = shouldPostByInterval(intervalMinutes, lastSent?.updated_at || null);
        if (!shouldPost) {
          const minutesSinceLast = lastSent?.updated_at 
            ? Math.round((Date.now() - new Date(lastSent.updated_at).getTime()) / 60000)
            : 0;
          console.log(`[auto-post] User ${userId}: Interval not reached - ${minutesSinceLast}min since last, need ${intervalMinutes}min`);
          results.push({ userId, status: "interval_not_reached" });
          continue;
        }
        console.log(`[auto-post] User ${userId}: ✓ Interval ${intervalMinutes}min reached (in range ${intervalStartTime}-${intervalEndTime})!`);
      } else {
        // Fixed times mode: check if current time matches
        if (!isPostingTime(currentTimeStr, postingTimes)) {
          results.push({ userId, status: "not_posting_time" });
          continue;
        }
        console.log(`[auto-post] User ${userId}: ✓ Time ${currentTimeStr} matches!`);
      }

      // Step D: 15-MINUTE LOCKOUT - Check if we already sent in the last 15 minutes (prevents duplicates)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentSent, error: recentError } = await supabase
        .from("products")
        .select("id, updated_at")
        .eq("user_id", userId)
        .eq("status", "Sent")
        .gte("updated_at", fifteenMinutesAgo)
        .limit(1);

      if (recentError) {
        console.error(`[auto-post] User ${userId}: Error checking recent sends: ${recentError.message}`);
      }

      if (recentSent && recentSent.length > 0) {
        console.log(`[auto-post] User ${userId}: Skipping - Already sent a post in last 15 min (product ${recentSent[0].id} at ${recentSent[0].updated_at})`);
        results.push({ userId, status: "already_sent_this_slot" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: No recent sends. Searching for scheduled product...`);

      // Step E: Fetch the OLDEST product with status 'Scheduled'
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "Scheduled")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error(`[auto-post] User ${userId}: Error fetching product: ${fetchError.message}`);
        results.push({ userId, status: "fetch_error", error: fetchError.message });
        continue;
      }

      if (!product) {
        console.log(`[auto-post] User ${userId}: No 'Scheduled' products in queue`);
        results.push({ userId, status: "queue_empty" });
        continue;
      }

      console.log(`[auto-post] User ${userId}: Found product ${product.id}. Locking...`);

      // Step F: LOCK IT - Update status to 'processing' to prevent double-send
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

      // Fetch active messaging accounts for user
      const { data: accounts, error: accountsError } = await supabase
        .from("messaging_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);
      
      if (accountsError) {
        console.error(`[auto-post] User ${userId}: Failed to fetch messaging accounts:`, accountsError.message);
        results.push({ userId, status: "accounts_error", productId: product.id });
        await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
        continue;
      }

      if (!accounts || accounts.length === 0) {
        console.log(`[auto-post] User ${userId}: No active messaging accounts`);
        results.push({ userId, status: "no_active_accounts", productId: product.id });
        await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
        continue;
      }

      // Step G: Build message and send
      const message = buildMessage(product);
      let sendSuccess = false;
      let sentTo: string[] = [];

      // Process each active account
      for (const account of accounts) {
        // Fetch decrypted credentials for this account
        const { data: credentials, error: credError } = await supabase
          .rpc("get_decrypted_messaging_account_credentials", { 
            p_account_id: account.id, 
            p_user_id: userId 
          });
        
        if (credError || !credentials) {
          console.error(`[auto-post] User ${userId}: Failed to fetch credentials for account ${account.account_name}:`, credError?.message);
          continue;
        }

        if (account.account_type === "telegram") {
          // Try Telegram
          const botToken = credentials.telegram_bot_token;
          const chatId = account.telegram_chat_id;
          
          if (botToken && chatId) {
            try {
              await sendToTelegram(botToken, chatId, product, message);
              sendSuccess = true;
              sentTo.push(`telegram:${account.account_name}`);
              console.log(`[auto-post] User ${userId}: ✓ Sent to Telegram (${account.account_name})`);
            } catch (e) {
              console.error(`[auto-post] User ${userId}: Telegram (${account.account_name}) failed: ${e}`);
            }
          } else {
            console.log(`[auto-post] User ${userId}: Telegram (${account.account_name}) missing credentials: botToken=${!!botToken}, chatId=${!!chatId}`);
          }
        } else if (account.account_type === "whatsapp") {
          // Try WhatsApp (GreenAPI)
          const instanceId = credentials.greenapi_instance_id;
          const apiToken = credentials.greenapi_api_token;
          const chatId = account.whatsapp_chat_id;
          
          if (instanceId && apiToken && chatId) {
            try {
              await sendToWhatsApp(instanceId, apiToken, chatId, product, message);
              sendSuccess = true;
              sentTo.push(`whatsapp:${account.account_name}`);
              console.log(`[auto-post] User ${userId}: ✓ Sent to WhatsApp (${account.account_name})`);
            } catch (e) {
              console.error(`[auto-post] User ${userId}: WhatsApp (${account.account_name}) failed: ${e}`);
            }
          } else {
            console.log(`[auto-post] User ${userId}: WhatsApp (${account.account_name}) missing credentials: instanceId=${!!instanceId}, apiToken=${!!apiToken}, chatId=${!!chatId}`);
          }
        }
      }

      // Step H: Final Status Update
      let finalStatus: string;
      if (sendSuccess) {
        finalStatus = "Sent";
      } else {
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

// Escape special Markdown characters for Telegram
function escapeMarkdown(text: string): string {
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`');
}

// Message builder - includes title, price, and description
function buildMessage(product: Record<string, unknown>): string {
  const rawTitle = String(product.title ?? "").trim();
  const title = escapeMarkdown(rawTitle);
  const price = product.price ? `₪${Number(product.price).toFixed(2)}` : "";
  const description = String(product.hebrew_description ?? "").trim();
  const affiliateLink = String(product.affiliate_link ?? "").trim();
  
  // Build message with all components
  const parts: string[] = [];
  
  if (title) parts.push(`🛒 *${title}*`);
  if (price) parts.push(`💰 ${price}`);
  if (description) parts.push(`\n${description}`);
  
  // Only add affiliate link if it's NOT already in the description
  if (affiliateLink && !description.includes(affiliateLink)) {
    parts.push(`\n🔗 ${affiliateLink}`);
  }
  
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
