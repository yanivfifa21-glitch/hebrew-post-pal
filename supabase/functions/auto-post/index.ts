import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ISRAEL TIME LOGIC (using Asia/Jerusalem timezone) ---
function getIsraelTimeInfo(): { hours: number; minutes: number; dayOfWeek: number; timeStr: string } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', weekday: 'short'
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

function isPostingTime(currentTimeStr: string, postingTimes: string[]): boolean {
  return postingTimes.includes(currentTimeStr);
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isInShabbatMode(
  dayOfWeek: number, currentTimeStr: string,
  shabbatEnabled: boolean, shabbatStartTime: string, shabbatEndTime: string
): boolean {
  if (!shabbatEnabled) return false;
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(shabbatStartTime);
  const endMinutes = timeToMinutes(shabbatEndTime);
  if (dayOfWeek === 5 && currentMinutes >= startMinutes) return true;
  if (dayOfWeek === 6 && currentMinutes < endMinutes) return true;
  return false;
}

function isWithinIntervalTimeRange(currentTimeStr: string, intervalStartTime: string, intervalEndTime: string): boolean {
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(intervalStartTime);
  const endMinutes = timeToMinutes(intervalEndTime);
  if (startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function shouldPostByInterval(intervalMinutes: number | null, lastSentTime: string | null): boolean {
  if (!intervalMinutes) return false;
  if (!lastSentTime) return true;
  const lastSent = new Date(lastSentTime);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSent.getTime()) / (1000 * 60);
  return diffMinutes >= intervalMinutes;
}

// Escape special HTML characters for Telegram
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildMessage(product: Record<string, unknown>): string {
  const rawDescription = String(product.hebrew_description ?? "").trim();
  const description = escapeHtml(rawDescription);
  const affiliateLink = String(product.affiliate_link ?? "").trim();
  const parts: string[] = [];
  if (description) parts.push(description);
  if (affiliateLink && rawDescription && !rawDescription.includes(affiliateLink)) {
    parts.push(`\n🔗 ${affiliateLink}`);
  }
  if (parts.length === 0 && affiliateLink) parts.push(`🔗 ${affiliateLink}`);
  return parts.join("\n");
}

async function sendToTelegram(token: string, chatId: string, product: any, text: string) {
  const imageUrl = product.image_url;
  const mediaType = product.media_type || 'image';
  const isVideo = mediaType === 'video' || (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);

  if (imageUrl) {
    if (isVideo) {
      console.log("[auto-post] Downloading video for upload...");
      try {
        const videoResponse = await fetch(imageUrl);
        if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
        const videoBlob = await videoResponse.blob();
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", text);
        formData.append("parse_mode", "HTML");
        formData.append("video", videoBlob, "video.mp4");
        formData.append("supports_streaming", "true");
        const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: "POST", body: formData });
        const result = await res.json();
        if (!result.ok) {
          console.log("[auto-post] FormData upload failed, trying URL method:", result.description);
          const res2 = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, video: imageUrl, caption: text, parse_mode: "HTML", supports_streaming: true }),
          });
          if (!res2.ok) throw new Error(await res2.text());
        }
      } catch (downloadErr) {
        console.error("[auto-post] Video download failed, trying URL method:", downloadErr);
        const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, video: imageUrl, caption: text, parse_mode: "HTML", supports_streaming: true }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
    } else {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption: text, parse_mode: "HTML" }),
      });
      if (!res.ok) throw new Error(await res.text());
    }
  } else {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" }),
    });
    if (!res.ok) throw new Error(await res.text());
  }
}

async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
  if (!chatId.includes("@")) chatId = `${chatId}@${chatId.length > 15 ? "g.us" : "c.us"}`;
  const baseUrl = `https://api.green-api.com/waInstance${instance}`;
  const imageUrl = product.image_url;
  const mediaType = product.media_type || 'image';
  const isVideo = mediaType === 'video' || (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);
  const url = imageUrl ? `${baseUrl}/sendFileByUrl/${token}` : `${baseUrl}/sendMessage/${token}`;
  const body: any = { chatId };
  if (imageUrl) {
    body.urlFile = imageUrl;
    body.fileName = isVideo ? "video.mp4" : "image.jpg";
    body.caption = text;
  } else {
    body.message = text;
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
}

// --- Send product to specific accounts ---
async function sendProductToAccounts(
  supabase: any,
  userId: string,
  product: any,
  message: string,
  accountIds: string[]
): Promise<{ success: boolean; sentTo: string[] }> {
  let sendSuccess = false;
  const sentTo: string[] = [];

  for (const accountId of accountIds) {
    const { data: account } = await supabase
      .from("messaging_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!account) continue;

    const { data: credentials, error: credError } = await supabase
      .rpc("get_decrypted_messaging_account_credentials", {
        p_account_id: account.id,
        p_user_id: userId
      });

    if (credError || !credentials) {
      console.error(`[auto-post] Failed to fetch credentials for account ${account.account_name}:`, credError?.message);
      continue;
    }

    if (account.account_type === "telegram") {
      const botToken = credentials.telegram_bot_token;
      const chatId = account.telegram_chat_id;
      if (botToken && chatId) {
        try {
          await sendToTelegram(botToken, chatId, product, message);
          sendSuccess = true;
          sentTo.push(`telegram:${account.account_name}`);
          console.log(`[auto-post] ✓ Sent to Telegram (${account.account_name})`);
        } catch (e) {
          console.error(`[auto-post] Telegram (${account.account_name}) failed: ${e}`);
        }
      }
    } else if (account.account_type === "whatsapp") {
      const instanceId = credentials.greenapi_instance_id;
      const apiToken = credentials.greenapi_api_token;
      const chatId = account.whatsapp_chat_id;
      if (instanceId && apiToken && chatId) {
        try {
          await sendToWhatsApp(instanceId, apiToken, chatId, product, message);
          sendSuccess = true;
          sentTo.push(`whatsapp:${account.account_name}`);
          console.log(`[auto-post] ✓ Sent to WhatsApp (${account.account_name})`);
        } catch (e) {
          console.error(`[auto-post] WhatsApp (${account.account_name}) failed: ${e}`);
        }
      }
    }
  }

  return { success: sendSuccess, sentTo };
}

// ============ MAIN ============
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { data: settings } = await supabase
      .from("app_settings")
      .select("*")
      .eq("automation_enabled", true);

    if (!settings || settings.length === 0) {
      console.log("[auto-post] No users with automation enabled");
      return new Response(JSON.stringify({ message: "No active users" }), { headers: corsHeaders });
    }

    const results: any[] = [];

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const shabbatEnabled: boolean = userSettings.shabbat_mode_enabled || false;
      const shabbatStartTime: string = userSettings.shabbat_start_time || '14:00';
      const shabbatEndTime: string = userSettings.shabbat_end_time || '20:00';

      // Step A: Check Shabbat mode first (global)
      if (isInShabbatMode(currentDayOfWeek, currentTimeStr, shabbatEnabled, shabbatStartTime, shabbatEndTime)) {
        console.log(`[auto-post] User ${userId}: Skipping - Shabbat mode active`);
        results.push({ userId, status: "shabbat_mode" });
        continue;
      }

      // Step B: Check if user has zones
      const { data: zones } = await supabase
        .from("zones")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (zones && zones.length > 0) {
        // ===== ZONE-BASED LOGIC =====
        console.log(`[auto-post] User ${userId}: Processing ${zones.length} active zones`);

        for (const zone of zones) {
          const zoneLabel = `[Zone:${zone.name}]`;

          // Check publishing day for this zone
          const zoneDays: number[] = zone.publishing_days || [0,1,2,3,4,5,6];
          if (!zoneDays.includes(currentDayOfWeek)) {
            console.log(`[auto-post] ${zoneLabel}: Skipping - Day ${currentDayOfWeek} not in days`);
            continue;
          }

          // Check time range
          if (!isWithinIntervalTimeRange(currentTimeStr, zone.interval_start_time, zone.interval_end_time)) {
            console.log(`[auto-post] ${zoneLabel}: Skipping - Outside time range ${zone.interval_start_time}-${zone.interval_end_time}`);
            continue;
          }

          // Check interval
          if (!shouldPostByInterval(zone.interval_minutes, zone.last_posted_at)) {
            console.log(`[auto-post] ${zoneLabel}: Interval not reached`);
            continue;
          }

          // Get zone's target accounts
          const { data: zoneAccountRows } = await supabase
            .from("zone_accounts")
            .select("account_id")
            .eq("zone_id", zone.id);

          const targetAccountIds = (zoneAccountRows || []).map((r: any) => r.account_id);
          if (targetAccountIds.length === 0) {
            console.log(`[auto-post] ${zoneLabel}: No target accounts configured`);
            continue;
          }

          // Get oldest Scheduled product in this zone
          const { data: zoneProduct } = await supabase
            .from("zone_products")
            .select("*, products(*)")
            .eq("zone_id", zone.id)
            .eq("status", "Scheduled")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!zoneProduct || !zoneProduct.products) {
            console.log(`[auto-post] ${zoneLabel}: No scheduled products`);
            continue;
          }

          const product = zoneProduct.products;
          console.log(`[auto-post] ${zoneLabel}: Found product ${product.id}, sending...`);

          // Lock the zone_product
          await supabase
            .from("zone_products")
            .update({ status: "processing" })
            .eq("id", zoneProduct.id)
            .eq("status", "Scheduled");

          const message = buildMessage(product);
          const { success, sentTo } = await sendProductToAccounts(supabase, userId, product, message, targetAccountIds);

          if (success) {
            // Mark zone_product as sent
            await supabase
              .from("zone_products")
              .update({ status: "Sent", sent_at: new Date().toISOString() })
              .eq("id", zoneProduct.id);

            // Update zone's last_posted_at
            await supabase
              .from("zones")
              .update({ last_posted_at: new Date().toISOString() })
              .eq("id", zone.id);

            // Also update the main product status if ALL zone assignments are now Sent
            const { data: remainingScheduled } = await supabase
              .from("zone_products")
              .select("id")
              .eq("product_id", product.id)
              .eq("status", "Scheduled")
              .limit(1);

            if (!remainingScheduled || remainingScheduled.length === 0) {
              await supabase
                .from("products")
                .update({ status: "Sent", sent_via: product.sent_via || "auto" })
                .eq("id", product.id);
            }

            console.log(`[auto-post] ${zoneLabel}: ✓ Product ${product.id} sent to ${sentTo.join(", ")}`);
            results.push({ userId, zone: zone.name, productId: product.id, status: "Sent", sentTo });
          } else {
            // Reset to Scheduled
            await supabase
              .from("zone_products")
              .update({ status: "Scheduled" })
              .eq("id", zoneProduct.id);
            console.log(`[auto-post] ${zoneLabel}: Failed to send, resetting`);
            results.push({ userId, zone: zone.name, productId: product.id, status: "send_failed" });
          }
        }
      } else {
        // ===== LEGACY: NO ZONES - EXISTING LOGIC =====
        const publishingDays: number[] = userSettings.publishing_days || [0,1,2,3,4,5,6];
        const intervalMinutes: number | null = userSettings.posting_interval_minutes ||
          (userSettings.posting_interval_hours ? userSettings.posting_interval_hours * 60 : null);
        const intervalStartTime: string = userSettings.interval_start_time || '08:00';
        const intervalEndTime: string = userSettings.interval_end_time || '22:00';
        const postingTimes: string[] = userSettings.posting_times || [];

        if (!publishingDays.includes(currentDayOfWeek)) {
          results.push({ userId, status: "skipped_day" });
          continue;
        }

        let shouldPost = false;
        if (intervalMinutes) {
          if (!isWithinIntervalTimeRange(currentTimeStr, intervalStartTime, intervalEndTime)) {
            results.push({ userId, status: "outside_interval_range" });
            continue;
          }
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
            results.push({ userId, status: "interval_not_reached" });
            continue;
          }
        } else {
          if (!isPostingTime(currentTimeStr, postingTimes)) {
            results.push({ userId, status: "not_posting_time" });
            continue;
          }
        }

        // 15-minute lockout
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentSent } = await supabase
          .from("products")
          .select("id, updated_at")
          .eq("user_id", userId)
          .eq("status", "Sent")
          .gte("updated_at", fifteenMinutesAgo)
          .limit(1);

        if (recentSent && recentSent.length > 0) {
          results.push({ userId, status: "already_sent_this_slot" });
          continue;
        }

        const { data: product, error: fetchError } = await supabase
          .from("products")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "Scheduled")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (fetchError) {
          results.push({ userId, status: "fetch_error", error: fetchError.message });
          continue;
        }
        if (!product) {
          results.push({ userId, status: "queue_empty" });
          continue;
        }

        // Lock product
        await supabase
          .from("products")
          .update({ status: "processing" })
          .eq("id", product.id)
          .eq("status", "Scheduled");

        // Get all active accounts
        const { data: accounts } = await supabase
          .from("messaging_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true);

        if (!accounts || accounts.length === 0) {
          await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
          results.push({ userId, status: "no_active_accounts", productId: product.id });
          continue;
        }

        const message = buildMessage(product);
        const { success, sentTo } = await sendProductToAccounts(
          supabase, userId, product, message, accounts.map((a: any) => a.id)
        );

        const finalStatus = success ? "Sent" : "Scheduled";
        await supabase
          .from("products")
          .update({ status: finalStatus, ...(finalStatus === "Sent" && !product.sent_via ? { sent_via: "auto" } : {}) })
          .eq("id", product.id);

        results.push({ userId, productId: product.id, status: finalStatus, sentTo });
      }
    }

    return new Response(JSON.stringify({ success: true, time: currentTimeStr, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-post] Critical Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
