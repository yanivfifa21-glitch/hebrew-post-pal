import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Israel timezone offset (IST = UTC+2, IDT = UTC+3)
function getIsraelTime(): Date {
  const now = new Date();
  // Israel is UTC+2 in winter, UTC+3 in summer (DST)
  // Check if DST is active (roughly March-October)
  const month = now.getUTCMonth();
  const isDST = month >= 2 && month <= 9; // March (2) to October (9)
  const offsetHours = isDST ? 3 : 2;
  
  return new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
}

function formatTime(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

interface LogEntry {
  user_id: string;
  run_id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const runId = crypto.randomUUID();
  const logs: LogEntry[] = [];
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const addLog = (userId: string, level: LogEntry['level'], message: string, context?: Record<string, unknown>) => {
    const logEntry: LogEntry = { user_id: userId, run_id: runId, level, message, context };
    logs.push(logEntry);
    console.log(`[auto-post][${level}] ${message}`, context ? JSON.stringify(context) : '');
  };

  const saveLogs = async () => {
    if (logs.length === 0) return;
    try {
      await supabase.from("automation_logs").insert(logs);
    } catch (e) {
      console.error("[auto-post] Failed to save logs:", e);
    }
  };

  try {
    const israelTime = getIsraelTime();
    const currentTimeStr = formatTime(israelTime);
    const currentHour = israelTime.getUTCHours();
    const currentMinute = israelTime.getUTCMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    console.log(`[auto-post] Starting automation check at Israel time: ${currentTimeStr}`);

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
      return new Response(JSON.stringify({ success: true, message: "No automation enabled", israelTime: currentTimeStr }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: unknown[] = [];

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const postingTimes: string[] = userSettings.posting_times || [];

      addLog(userId, 'info', `Checking automation`, { postingTimes, currentTime: currentTimeStr });

      // Check if current time matches any posting window (within 1 minute tolerance)
      let matchedTime: string | null = null;
      for (const time of postingTimes) {
        const [h, m] = time.split(':').map(Number);
        const targetTotalMinutes = h * 60 + m;
        const diff = Math.abs(currentTotalMinutes - targetTotalMinutes);
        // Match if within 1 minute (handles cron running at :00 or :01)
        if (diff <= 1 || diff >= (24 * 60 - 1)) {
          matchedTime = time;
          break;
        }
      }

      if (!matchedTime) {
        addLog(userId, 'info', `Not posting time`, { currentTime: currentTimeStr, nextTimes: postingTimes });
        results.push({ userId, status: "skipped", reason: "Not posting time", currentTime: currentTimeStr });
        continue;
      }

      addLog(userId, 'info', `Matched posting time: ${matchedTime}`, { currentTime: currentTimeStr });

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
        addLog(userId, 'error', `Product fetch error`, { error: productErr.message });
        results.push({ userId, status: "error", error: productErr.message });
        continue;
      }

      if (!product) {
        addLog(userId, 'info', `No queued products found`);
        results.push({ userId, status: "skipped", reason: "No queued products" });
        continue;
      }

      addLog(userId, 'info', `Found product to send`, { productId: product.id, title: product.title });

      // Get ALL active messaging accounts for this user
      const { data: accounts, error: accountsErr } = await supabase
        .from("messaging_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (accountsErr) {
        addLog(userId, 'error', `Accounts fetch error`, { error: accountsErr.message });
      }

      // Build message content with full product data
      const message = buildMessage(product);
      const successChannels: string[] = [];
      const failedChannels: string[] = [];

      // Prepare all send operations
      const sendOperations: Promise<{ channel: string; success: boolean; error?: string }>[] = [];

      // Multi-account sending
      if (accounts && accounts.length > 0) {
        for (const account of accounts) {
          if (account.account_type === "telegram" && account.telegram_bot_token && account.telegram_chat_id) {
            sendOperations.push(
              sendToTelegram(account.telegram_bot_token, account.telegram_chat_id, product, message)
                .then(() => ({ channel: `telegram:${account.account_name}`, success: true }))
                .catch((e) => ({ channel: `telegram:${account.account_name}`, success: false, error: String(e) }))
            );
          }

          if (account.account_type === "whatsapp" && account.greenapi_instance_id && account.greenapi_api_token && account.greenapi_chat_id) {
            sendOperations.push(
              sendToWhatsApp(account.greenapi_instance_id, account.greenapi_api_token, account.greenapi_chat_id, product, message)
                .then(() => ({ channel: `whatsapp:${account.account_name}`, success: true }))
                .catch((e) => ({ channel: `whatsapp:${account.account_name}`, success: false, error: String(e) }))
            );
          }
        }
      }

      // Fallback to legacy single-account settings if no multi-accounts
      if (sendOperations.length === 0) {
        if (userSettings.telegram_enabled && userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
          sendOperations.push(
            sendToTelegram(userSettings.telegram_bot_token, userSettings.telegram_chat_id, product, message)
              .then(() => ({ channel: "telegram:legacy", success: true }))
              .catch((e) => ({ channel: "telegram:legacy", success: false, error: String(e) }))
          );
        }

        if (userSettings.whatsapp_enabled && userSettings.greenapi_instance_id && userSettings.greenapi_api_token && userSettings.greenapi_chat_id) {
          sendOperations.push(
            sendToWhatsApp(userSettings.greenapi_instance_id, userSettings.greenapi_api_token, userSettings.greenapi_chat_id, product, message)
              .then(() => ({ channel: "whatsapp:legacy", success: true }))
              .catch((e) => ({ channel: "whatsapp:legacy", success: false, error: String(e) }))
          );
        }
      }

      if (sendOperations.length === 0) {
        addLog(userId, 'warn', `No active messaging accounts configured`);
        results.push({ userId, status: "skipped", reason: "No active accounts" });
        continue;
      }

      // Execute all sends in parallel using Promise.allSettled
      const sendResults = await Promise.allSettled(sendOperations);

      for (const result of sendResults) {
        if (result.status === "fulfilled") {
          const { channel, success, error } = result.value;
          if (success) {
            successChannels.push(channel);
          } else {
            failedChannels.push(`${channel}: ${error}`);
          }
        } else {
          failedChannels.push(`Unknown: ${result.reason}`);
        }
      }

      addLog(userId, 'info', `Send results`, { 
        productId: product.id, 
        successChannels, 
        failedChannels,
        totalAttempted: sendOperations.length 
      });

      // Update product status based on results
      if (successChannels.length > 0) {
        await supabase
          .from("products")
          .update({ status: "sent", channels: successChannels })
          .eq("id", product.id);

        addLog(userId, 'info', `Product marked as sent`, { productId: product.id, channels: successChannels });
        results.push({ 
          userId, 
          productId: product.id, 
          status: "sent", 
          successChannels, 
          failedChannels: failedChannels.length > 0 ? failedChannels : undefined 
        });
      } else {
        addLog(userId, 'error', `All channels failed`, { productId: product.id, errors: failedChannels });
        results.push({ userId, productId: product.id, status: "all_failed", errors: failedChannels });
      }
    }

    // Save all logs to database
    await saveLogs();

    console.log("[auto-post] Final results:", JSON.stringify(results, null, 2));
    return new Response(JSON.stringify({ 
      success: true, 
      results, 
      israelTime: currentTimeStr,
      runId 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-post] Error:", e);
    await saveLogs();
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Build a rich message from product data
function buildMessage(product: Record<string, unknown>): string {
  const parts: string[] = [];
  
  // Title
  if (product.title) {
    parts.push(`🔥 *${product.title}*`);
  }
  
  // Hebrew description (main content)
  if (product.hebrew_description) {
    parts.push(String(product.hebrew_description));
  }
  
  // Price
  if (product.price) {
    parts.push(`💰 מחיר: $${product.price}`);
  }
  
  // Rating
  if (product.rating && Number(product.rating) > 0) {
    parts.push(`⭐ דירוג: ${product.rating}`);
  }
  
  // Orders count
  if (product.orders_count && Number(product.orders_count) > 0) {
    parts.push(`📦 הזמנות: ${product.orders_count}`);
  }
  
  // Affiliate link
  if (product.affiliate_link) {
    parts.push(`\n🔗 ${product.affiliate_link}`);
  } else if (product.original_url) {
    parts.push(`\n🔗 ${product.original_url}`);
  }
  
  return parts.join('\n\n');
}

// Send to Telegram
async function sendToTelegram(
  botToken: string, 
  chatId: string, 
  product: Record<string, unknown>,
  message: string
): Promise<void> {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;
  
  let response: Response;
  
  if (product.image_url) {
    // Send photo with caption
    response = await fetch(`${baseUrl}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: product.image_url,
        caption: message.substring(0, 1024),
        parse_mode: "Markdown",
      }),
    });
  } else {
    // Send text only
    response = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  }
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram API error: ${errText}`);
  }
}

// Send to WhatsApp via GreenAPI
async function sendToWhatsApp(
  instanceId: string,
  apiToken: string,
  chatId: string,
  product: Record<string, unknown>,
  message: string
): Promise<void> {
  // Format chat ID for GreenAPI
  let formattedChatId = chatId;
  if (chatId && !chatId.includes("@")) {
    formattedChatId = chatId.includes("-") ? `${chatId}@g.us` : `${chatId}@c.us`;
  }
  
  const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;
  
  let response: Response;
  
  if (product.image_url) {
    // Send file with caption
    response = await fetch(`${baseUrl}/sendFileByUrl/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: formattedChatId,
        urlFile: product.image_url,
        fileName: "deal.jpg",
        caption: message,
      }),
    });
  } else {
    // Send text only
    response = await fetch(`${baseUrl}/sendMessage/${apiToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: formattedChatId,
        message: message,
      }),
    });
  }
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WhatsApp API error: ${errText}`);
  }
}
